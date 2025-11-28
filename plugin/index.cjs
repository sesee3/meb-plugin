const { config, validateConfig } = require("./config.js");
const { setupRoutes, getOpenApiSpec } = require("./tools/routes.js");
const { getStormGlassWeather } = require("./api_models/stormglass.js");
const { getAppleWeatherForecast } = require("./api_models/weatherkit.js");
const { aisStream } = require("./api_models/aisstream.js")
const mapHandler = require("./tools/map.handler.js");
const { linkBot, send } = require("./bot/telegram.core.js");
const dataset = require("./datasetModels/datasetCore.js");
const dataUtils = require("./datasetModels/datasetUtils.js");
const { generateToken, encryptLog, loadSecureFile, saveSecureFile } = require("./tools/crypt.js");
const fs = require("fs");
const path = require("path");

const {publish} = require("./tools/publisher.js");

const CONFIG = Object.freeze({
    log_interval: 2000, //Frequenza di aggiornamento  
    number_value_fallback: 999999999999,
    value_fallback: "Funzionalità da Sviluppare"
});

const CSV_HEADERS = Object.freeze([
    'timestamp',
    'wavesHeight',
    'wavesPeriod',
    'wavesDirection',
    'windSpeed',
    'windDirection',
    'temperature',
    'currentSpeed',
    'currentDirection',
    'speedOverGround',
    'courseOverGround',
    'headingTrue',
    'latitude',
    'longitude',
    '1Voltage',
    '1Current',
    '1StateOfCharge',
    '1Temperature',
    '0Voltage',
    '0Current',
    '0CellsStateOfCharge',
    '0AverageCellTemperature',
    'propultionShaftSpeed',
    'systemUptime'
]);

const state = {
    logTimer: null,
    logStreamer: null,
    logsCount: 0,
    isRecordingLogs: false,
    currentLogFile: null,
    currentLogKey: null, // Chiave generata all'inizio, usata alla fine
    weatherKitTimer: null,
    stormGlassTimer: null,
    unsubPos: null,
    app: null,
    startTime: null
};

const logsDirectory = dataUtils.getDirectory(__dirname + '/datasetModels/saved_datas');
const logsReferencesFile = path.join(__dirname, 'datasetModels/logs_references.json');
const lastCallRef = { current: null };


/**
 * Restituisce un valore preso dal DataBrowser di SignalK
 * @param {string} path - Path di SignalK
 * @param {*} fallback - Un valore predefinito in caso non ci fossero dati validi
 * @returns {*} Restituisce il valore letto o il fallback in caso di errore.
 */
const getSKValue = (path, fallback = CONFIG.value_fallback) => {
    if (!state.app) {
        console.warn(`[getSKValue] App not initialized, returning fallback for path: ${path}`);
        return fallback;
    }
    
    try {
        const value = state.app.getSelfPath(path)?.value;
        return (value !== undefined && value !== null) ? value : fallback;
    } catch (error) {
        console.error(`[getSKValue] Error reading path ${path}:`, error.message);
        return fallback;
    }
};

/**
 * Chiude in modo sicuro uno stream di scrittura
 * @param {WriteStream} stream - Lo stream aperto
 * @returns {Promise<void>}
 */
const closeStream = (stream) => {
    return new Promise((resolve) => {
        if (!stream || stream.destroyed) {
            resolve();
            return;
        }
        
        stream.end(() => {
            resolve();
        });
        
        setTimeout(resolve, 1000);
    });
};

/**
 * Clears an interval timer safely
 * @param {number|null} timerId - 
 * @returns {null}
 */
const clearIntervalSafe = (timerId) => {
    if (timerId) {
        clearInterval(timerId);
    }
    return null;
};

/**
 * Collects all sensor data for logging
 * @param {object} settings - Plugin settings containing default values
 * @returns {object} Object containing all sensor readings
 */
const collectSensorData = (settings = {}) => {
    return {
        timestamp: new Date().toISOString(),
        wavesHeight: getSKValue("meb.waves.height"),
        wavesPeriod: getSKValue("meb.waves.period"),
        wavesDirection: getSKValue("meb.waves.direction"),
        windSpeed: getSKValue("meb.appleWindSpeed"),
        windDirection: getSKValue("meb.appleWindDirection"),
        temperature: getSKValue("meb.temperature"),
        currentSpeed: getSKValue("meb.currents.speed"),
        currentDirection: getSKValue("meb.currents.direction"),
        speedOverGround: getSKValue("navigation.speedOverGround"),
        courseOverGround: getSKValue("navigation.courseOverGroundTrue"),
        headingTrue: getSKValue("navigation.headingTrue"),
        latitude: settings.latitude ?? CONFIG.number_value_fallback,
        longitude: settings.longitude ?? CONFIG.number_value_fallback,
        '1Voltage': getSKValue("electrical.batteries.1.voltage"),
        '1Current': getSKValue("electrical.batteries.1.current"),
        '1StateOfCharge': getSKValue("electrical.batteries.1.capacity.stateOfCharge"),
        '1Temperature': getSKValue("electrical.batteries.1.temperature"),
        '0Voltage': getSKValue("electrical.batteries.0.voltage"),
        '0Current': getSKValue("electrical.batteries.0.current"),
        '0CellsStateOfCharge': getSKValue("electrical.batteries.0.capacity.stateOfCharge"),
        '0AverageCellTemperature': getSKValue("electrical.batteries.0.temperature"),
        propultionShaftSpeed: getSKValue("propulsion.0.revolutions"),
        systemUptime: process.uptime() ?? CONFIG.number_value_fallback
    };
};


/**
 * Creates new log files with timestamp and initializes CSV stream
 * @returns {boolean} Success status
 */
function createNewFiles() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFileName = `log_${timestamp}.csv`;
        const logFile = path.join(logsDirectory, logFileName);

        // Close existing stream gracefully
        if (state.logStreamer && !state.logStreamer.destroyed) {
            state.logStreamer.end();
        }

        state.logStreamer = fs.createWriteStream(logFile, { flags: 'a' });
        
        state.logStreamer.on('error', (err) => {
            console.error('[log_file] Errore nello stream:', err);
        });

        dataset.datasetInit(CSV_HEADERS, state.logStreamer);
        state.logsCount = 0;

        // Genera la chiave ORA e salvala nello stato - sarà usata in stopRecording
        state.currentLogFile = logFileName;
        state.currentLogKey = generateToken();
        
        return true;
    } catch (error) {
        console.error('[log_file] Errore nella creazione di un nuovo file:', error);
        return false;
    }
}

// ==================== RECORDING CONTROL ====================

/**
 * Stops the data recording process
 * @returns {boolean} True if stopped successfully, false if already stopped
 */
function stopRecording() {
    if (!state.isRecordingLogs) {
        return false;
    }

    try {
        state.logTimer = clearIntervalSafe(state.logTimer);
        
        if (state.logStreamer && !state.logStreamer.destroyed) {
            state.logStreamer.end();
        }

        state.isRecordingLogs = false;

        // Usa la chiave generata all'inizio della sessione
        if (state.currentLogFile && state.currentLogKey) {
            const logFilePath = path.join(logsDirectory, state.currentLogFile);
            
            // Carica, aggiorna e salva references criptate
            const logsData = loadSecureFile(logsReferencesFile, { references: [] });
            logsData.references.push({
                name: state.currentLogFile,
                token: state.currentLogKey
            });
            saveSecureFile(logsReferencesFile, logsData);

            // Cripta il file log con la stessa chiave
            // encryptLog(logFilePath, state.currentLogKey);
            
            console.log(`[stopRecording] Log ${state.currentLogFile} criptato e salvato.`);
        }

        state.logsCount = 0;
        state.currentLogFile = null;
        state.currentLogKey = null;
        
        return true;
    } catch (error) {
        console.error('[log_stop] Errore durante l\'arresto della registrazione:', error);
        return false;
    }
}

/**
 * Starts the data recording process
 * @param {object} settings - Plugin settings
 * @returns {boolean} True if started successfully, false if already running
 */
function startRecording(settings = {}) {
    if (state.isRecordingLogs) {
        return false;
    }

    try {
        state.isRecordingLogs = true;
        state.startTime = Date.now();
        
        if (!createNewFiles()) {
            state.isRecordingLogs = false;
            return false;
        }

        state.logTimer = setInterval(() => {
            try {
                const data = collectSensorData(settings);
                dataset.appendData(data, CSV_HEADERS, state.logStreamer);
                state.logsCount++;
            } catch (error) {
                console.error('[log_dataset_error] Errore durante la raccolta dei dati:', error);
            }
        }, CONFIG.log_interval);

        return true;
    } catch (error) {
        console.error('[log_dataset_error] Errore nell\'avvio della registrazione', error);
        state.isRecordingLogs = false;
        return false;
    }
}

/**
 * Restarts the recording process
 * @param {object} settings - Plugin settings
 * @returns {boolean} Success status
 */
function restartRecording(settings = {}) {
    stopRecording();
    startRecording(settings);
    return true;
}

/**
 * Gets current recording status with detailed metrics
 * @returns {object} Status object
 */
function getRecordingStatus() {
    return {
        isRecording: state.isRecordingLogs,
        recordCount: state.logsCount,
        recordingInterval: CONFIG.log_interval,
        uptime: state.startTime ? Date.now() - state.startTime : 0,
        timestamp: new Date().toISOString()
    };
}

module.exports = function (app) {
    state.app = app;

    const plugin = {
        id: "meb",
        name: "MEB Plugin",

        start: async (settings) => {
            try {
                // Valida configurazione ma non bloccare il plugin se mancano chiavi opzionali
                validateConfig();

                // ==================== BOT TELEGRAM ====================
                if (config.telegramBotToken) {
                    try {
                        await linkBot(app);
                        await send("Il computer di bordo è di nuovo attivo e disponibile.");
                    } catch (error) {
                        console.error('[ERROR] Errore nell\' avvio del bot telegram', error)
                    }
                } else {
                    console.warn('[MEB TELEGRAM] Bot disabilitato: TELEGRAM_BOT_TOKEN non configurato.');
                }

                // ==================== WEB SOCKET AISSTREAM ====================
                try {
                    aisStream();
                } catch (error) {
                    console.error('[ERROR] Errore in AISStream:', error);
                }

                // ==================== WEATHER UPDATES ====================
                // WEATHER
const weatherKitInterval = Math.max(10, Number(settings?.updaterInterval ?? 60));
const stormGlassInterval = 3600; // 1 ora in secondi

let location = null;

const updateWeatherKit = async () => {
    if (!location || !location.latitude || !location.longitude) {
        console.error("Posizione non disponibile per WeatherKit, uso lat/lon dal pannello impostazioni");
        location = {
            latitude: 38.1137,
            longitude: 15.3315,
        };
    }

    try {
        const weatherKitData = await getAppleWeatherForecast(location);

        const weatherData = {
            temperature: weatherKitData.temperature,
            pressure: weatherKitData.pressure,
            rain: weatherKitData.rain,
            appleWindSpeed: weatherKitData.windSpeed,
            appleWindDirection: weatherKitData.windDirection,
        };

        publish(app, weatherData, settings);
        console.log("✅ WeatherKit aggiornato con successo");

    } catch (error) {
        console.error("❌ WEATHERKIT UPDATE FAIL:", error.message);
        console.error(error.stack);
    }
};

const updateStormGlass = async () => {
    if (!location || !location.latitude || !location.longitude) {
        console.error("Posizione non disponibile per StormGlass, uso lat/lon dal pannello impostazioni");
        location = {
            latitude: Number(settings?.latitude),
            longitude: Number(settings?.longitude),
        };
    }

    try {
        const sgData = await getStormGlassWeather(location);

        if (!sgData || !sgData.swell) {
            console.error("⚠️ Dati StormGlass non validi:", sgData);
            return;
        }

        const weatherData = {
            swell: sgData.swell,
            currents: sgData.currents,
            wind: sgData.wind,
            waves: sgData.waves,
        };

        publish(app, weatherData, settings);
        console.log("✅ StormGlass aggiornato con successo");

    } catch (error) {
        console.error("❌ STORMGLASS UPDATE FAIL:", error.message);
        console.error(error.stack);
    }
};

// chiamata immediata
updateWeatherKit();
updateStormGlass();

// timer periodici (ms)
state.weatherKitTimer = setInterval(updateWeatherKit, weatherKitInterval * 1000);
state.stormGlassTimer = setInterval(updateStormGlass, stormGlassInterval * 1000);

                // ==================== MAPPA INTERATTIVA ====================
                try {
                    mapHandler(app, settings);
                } catch (error) {
                    console.error('[ERROR] Errore nell\'avvio della mappa:', error);
                }

                // ==================== LOG DATI ====================
                try {
                    startRecording(settings);
                } catch (error) {
                    console.error('[ERROR] Errore nell\'avvio dei log:', error);
                }


                app.datasetControl = {
                    start: () => startRecording(settings),
                    stop: stopRecording,
                    restart: () => restartRecording(settings),
                    getStatus: getRecordingStatus
                };

                // ===== Shutdown Hooks =====
                const shutdown = async (reason = 'signal') => {
                    try {
                        console.log(`[shutdown] Received ${reason}. Stopping plugin...`);
                        await plugin.stop();
                        process.exit(0);
                    } catch (err) {
                        console.error('[shutdown] Error during stop:', err);
                        process.exit(1);
                    }
                };

                // Evita di registrare multipli handler
                if (!process.__meb_shutdown_hooks_installed) {
                    process.__meb_shutdown_hooks_installed = true;
                    process.on('SIGINT', () => shutdown('SIGINT'));
                    process.on('SIGTERM', () => shutdown('SIGTERM'));
                    process.on('uncaughtException', (err) => {
                        console.error('[uncaughtException]', err);
                        shutdown('uncaughtException');
                    });
                    process.on('unhandledRejection', (reason) => {
                        console.error('[unhandledRejection]', reason);
                        shutdown('unhandledRejection');
                    });
                }

            } catch (error) {
                console.error('[Errore] Errore durante l\'avvio del plugin:', error);
                throw error;
            }
        },

        stop: async () => {
            try {
                state.weatherKitTimer = clearIntervalSafe(state.weatherKitTimer);
                state.stormGlassTimer = clearIntervalSafe(state.stormGlassTimer);

                if (typeof state.unsubPos === "function") {
                    try {
                        state.unsubPos();
                        state.unsubPos = null;
                    } catch (error) {
                        console.error('[ERROR] Errore durante la cancellazione dell\'iscrizione alla posizione:', error);
                    }
                }

                // stopRecording gestisce già criptazione e salvataggio reference
                if (app.datasetControl) {
                    try {
                        app.datasetControl.stop();
                    } catch (error) {
                        console.error('[ERROR] Errore durante l\'arresto del controllo del dataset:', error);
                    }
                }

                await closeStream(state.logStreamer);
                console.log('[stop] Plugin arrestato correttamente.');

            } catch (error) {
                console.error('[ERROR] Errore durante l\'arresto del plugin:', error);
            }
        },

        schema: () => ({
            type: "object",
            required: [],
            properties: {},
        }),

        registerWithRouter: (router) => {
            setupRoutes(router, lastCallRef, app);
        },

        getOpenApi: getOpenApiSpec,
    };

    return plugin;
};
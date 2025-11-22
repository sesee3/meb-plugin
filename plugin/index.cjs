const { validateConfig } = require("./config.js");
const { publish } = require("./publisher.js");
const { setupRoutes, getOpenApiSpec } = require("./routes.js");

const { getStormGlassWeather } = require("./stormglass.js");
const { getAppleWeatherForecast } = require("./weatherkit");
const { aisStream } = require("./aisstream.js")
const mapHandler = require("./map.handler.js");
const { linkBot } = require("./telegram.core.js");

const dataset = require("./datasetModels/datasetCore.js");
const fs = require("fs");
let datasetTimer = null;

module.exports = function (app) {
    let weatherKitTimer = null;
    let stormGlassTimer = null;
    let unsubPos = null;
    const lastCallRef = { current: null };

    let unsubscribe = []

    const plugin = {
        id: "meb",
        name: "MEB Plugin",

        start: async (settings) => {
            try {
                validateConfig();
            } catch (error) {
                app.error(error.message);
                throw error;
            }

            // BOT TELEGRAM
            try {
                await linkBot(app);
                console.log("✅ Telegram bot in ascolto dei messaggi");
            } catch (err) {
                console.error("❌ Errore avvio Telegram bot:", err.message);
            }

            //WEATHER
            const weatherKitInterval = Math.max(10, Number(settings?.updaterInterval ?? 60));
            const stormGlassInterval = 3600; // 1 ora in secondi

            let location = null;

            console.log("Aggiornamento meteo")
            // const updateWeatherKit = async () => {
            //     if (!location || !location.latitude || !location.longitude) {
            //         console.error("Posizione non disponibile per WeatherKit, uso lat/lon dal pannello impostazioni");
            //         location = {
            //             latitude: Number(settings?.latitude),
            //             longitude: Number(settings?.longitude),
            //         };
            //     }

            //     try {
            //         const weatherKitData = await getAppleWeatherForecast(location);

            //         const weatherData = {
            //             temperature: weatherKitData.temperature,
            //             pressure: weatherKitData.pressure,
            //             rain: weatherKitData.rain,
            //             appleWindSpeed: weatherKitData.windSpeed,
            //             appleWindDirection: weatherKitData.windDirection,
            //         };

            //         publish(app, weatherData, settings);
            //         console.log("✅ WeatherKit aggiornato con successo");

            //     } catch (error) {
            //         console.error("❌ WEATHERKIT UPDATE FAIL:", error.message);
            //         console.error(error.stack);
            //     }
            // };

            // const updateStormGlass = async () => {
            //     if (!location || !location.latitude || !location.longitude) {
            //         console.error("Posizione non disponibile per StormGlass, uso lat/lon dal pannello impostazioni");
            //         location = {
            //             latitude: Number(settings?.latitude),
            //             longitude: Number(settings?.longitude),
            //         };
            //     }

            //     try {
            //         const sgData = await getStormGlassWeather(location);

            //         if (!sgData || !sgData.swell) {
            //             console.error("⚠️ Dati StormGlass non validi:", sgData);
            //             return;
            //         }

            //         const weatherData = {
            //             swell: sgData.swell,
            //             currents: sgData.currents,
            //             wind: sgData.wind,
            //             waves: sgData.waves,
            //         };

            //         publish(app, weatherData, settings);
            //         console.log("✅ StormGlass aggiornato con successo");

            //     } catch (error) {
            //         console.error("❌ STORMGLASS UPDATE FAIL:", error.message);
            //         console.error(error.stack);
            //     }
            // };

            //WEB SOCKET AIS
            aisStream();

            // Ascolta aggiornamenti sulla posizione
            const locationStreamPath = app.streambundle.getSelfStream("navigation.position");
            unsubPos = locationStreamPath.onValue((pos) => {
                if (pos && pos.latitude && pos.longitude) {

                    location = pos;
                    settings.latitude = pos.latitude;
                    settings.longitude = pos.longitude;

                    console.log("Aggiornamento meteo");
                    // Avvia WeatherKit se non è già attivo
                    // if (!weatherKitTimer) {
                    //     updateWeatherKit();
                    //     weatherKitTimer = setInterval(updateWeatherKit, weatherKitInterval * 1000);
                    // }

                    // // Avvia StormGlass se non è già attivo
                    // if (!stormGlassTimer) {
                    //     updateStormGlass();
                    //     stormGlassTimer = setInterval(updateStormGlass, stormGlassInterval * 1000);
                    // }

                }
            });


            mapHandler(app, settings);

            //REGISTRAZIONE DATI
            const datasetStreamer = fs.createWriteStream('./dataset.csv', { flags: 'a' });
            const headers = ['latitude,longitude,speedOverGround,courseOverGround'];
            dataset.datasetInit(headers, datasetStreamer);

            datasetTimer = setInterval(() => {
                const now = new Date().toLocaleString();
                
            });

            
        },

        stop: async () => {
            if (weatherKitTimer) {
                clearInterval(weatherKitTimer);
                weatherKitTimer = null;
            }

            if (stormGlassTimer) {
                clearInterval(stormGlassTimer);
                stormGlassTimer = null;
            }

            if (typeof unsubPos === "function") {
                unsubPos();
                unsubPos = null;
            }
        },

        schema: () => ({
            type: "object",
            required: ["apiKey"],
            properties: {
                updaterInterval: {
                    type: "number",
                    title: "Frequenza aggiornamenti",
                    default: 120,
                    minimum: 60,
                    description:
                        "Scegli ogni quanti secondi i dati meteo si aggiorneranno. (Vedi i limiti di chiamate del tuo piano per ricevere sempre aggiornamenti). Max. 500.000 chimate al mese",
                },
                forecastAPISource: {
                    type: "string",
                    title: "Meteo delle prossime ore",
                    default: "appleWeather",
                    enum: ["unspecified", "openMeteo", "appleWeatherKit"],
                    enumNames: ["Unspecified", "OpenMeteo", "Apple WeatherKit"],
                    description: "Scegli se usare OpenMeteo o Apple WeatherKit per ottenere i dati sulle condizioni meteo nella zona dell'imbarcazione per le prossime ore",
                },
                mapboxKey: {
                    type: "string",
                    title: "Mapbox Access Token",
                    description: "Token di accesso Mapbox per visualizzare la mappa"
                },
                latitude: {
                    type: "number",
                    title: "Override Latitudine",
                    default: 38.17937,
                    description: "Latitudine da usare se non è disponibile la posizione da SignalK"
                },
                longitude: {
                    type: "number",
                    title: "Override Longitudine ",
                    default: 15.56699,
                    description: "Longitudine da usare se non è disponibile la posizione da SignalK"
                },
            },


        }),
        //Registra i route, tipo /ping o altri.
        registerWithRouter: (router) => { setupRoutes(router, lastCallRef); },
        getOpenApi: getOpenApiSpec,
    };

    return plugin;
};


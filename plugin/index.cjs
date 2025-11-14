const { validateConfig } = require("./config.js");
const { publish } = require("./publisher.js");
const { setupRoutes, getOpenApiSpec } = require("./routes.js");

const { getStormGlassWeather } = require("./stormglass.js");
const {getAppleWeatherForecast} = require("./weatherkit");

module.exports = function (app) {
    let updateTimer = null;
    let unsubPos = null;
    const lastCallRef = { current: null };

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


            const updateInterval = Math.max(10, Number(settings?.updaterInterval ?? 60));

            let location = null;

            const updateWeather = async () => {
                if (!location || !location.latitude || !location.longitude) {
                    console.error("Posizione non disponibile, uso lat/lon dal pannello impostazioni");
                    location = {
                        latitude: Number(settings?.latitude),
                        longitude: Number(settings?.longitude),
                    };
                }

                try {
                    console.log("Inizio aggiornamento meteo con posizione:", location);

                    const sgData = await getStormGlassWeather(location);
                    const weatherKitData = await getAppleWeatherForecast(location);

                    if (!sgData || !sgData.swell) {
                        console.error("⚠️ Dati StormGlass non validi:", sgData);
                        return;
                    }

                    const weatherData = {
                        temperature: weatherKitData.temperature,
                        pressure: weatherKitData.pressure,
                        rain: weatherKitData.rain,
                        swell: sgData.swell,
                        currents: sgData.currents,
                        wind: sgData.wind,
                        waves: sgData.waves,
                    };

                    publish(app, weatherData, settings);

                } catch (error) {
                    console.error("❌ WEATHER UPDATE FAIL:", error.message);
                    console.error(error.stack);
                }
            };

            // Ascolta aggiornamenti sulla posizione
            const locationStreamPath = app.streambundle.getSelfStream("navigation.position");
            unsubPos = locationStreamPath.onValue((pos) => {
                if (pos && pos.latitude && pos.longitude) {

                    location = pos;
                    settings.latitude = pos.latitude;
                    settings.longitude = pos.longitude;

                    console.log("🌍 Updated location in stormglass.js:", pos);

                    if (!updateTimer) {
                        updateWeather();
                        updateTimer = setInterval(updateWeather, updateInterval * 1000);
                    }
                }
            });
        },

        stop: async () => {
            if (updateTimer) {
                clearInterval(updateTimer);
                updateTimer = null;
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

        registerWithRouter: (router) => {
            // mantiene le route esistenti
            setupRoutes(router, lastCallRef);

            // Endpoint API JSON che restituisce tutti gli hours salvati dall'ultima chiamata a StormGlass
            router.get('/signalk/meb/waterPredictions/data', async (req, res) => {
                try {
                    // richiede i dati più recenti salvati in locale (se disponibili) oppure chiede all'API
                    const hours = await getStormGlassAllHours();
                    res.json({ success: true, hours });
                } catch (err) {
                    console.error('ERROR /signalk/meb/waterPredictions/data', err);
                    res.status(500).json({ success: false, error: err.message });
                }
            });

            // Pagina HTML con grafico e toggle tema
            router.get('/signalk/meb/waterPredictions', (req, res) => {
                const html = "";

                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.send(html);
            });
        },

        onSettingsChanged: (newSettings) => {
            if (newSettings.forceUpdate) {
                console.log("🔄 Forcing manual weather update...");
                forceUpdate(newSettings).then(r => {
                    console.log("FORCE UPDATE COMPLETED")
                });
            }
        },

        getOpenApi: getOpenApiSpec,
    };

    //an async function
    async function forceUpdate(settings) {
        location = {
            latitude: Number(settings?.latitude),
            longitude: Number(settings?.longitude),
        };

        try {
            console.log("Inizio aggiornamento meteo con posizione:", location);

            const sgData = await getStormGlassWeather(location);
            const weatherKitData = await getAppleWeatherForecast(location);

            if (!sgData || !sgData.swell) {
                console.error("⚠️ Dati StormGlass non validi:", sgData);
                return;
            }

            const weatherData = {
                temperature: weatherKitData.temperature,
                pressure: weatherKitData.pressure,
                rain: weatherKitData.rain,
                swell: sgData.swell,
                currents: sgData.currents,
                wind: sgData.wind,
                waves: sgData.waves,
            };

            console.log("FORCED UPDATED: ", weatherData)
            publish(app, weatherData, settings);

        } catch (error) {
            console.error("❌ WEATHER UPDATE FAIL:", error.message);
            console.error(error.stack);
        }
    }

    return plugin;
};
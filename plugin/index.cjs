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

            // Funzione per aggiornare i dati meteo
            const updateWeather = async () => {
                if (!location || !location.latitude || !location.longitude) {
                    console.log("⏳ Attesa posizione valida...");
                    return;
                }

                try {
                    console.log("📍 Posizione attuale:", location);

                    const sgData = await getStormGlassWeather(location);
                    const weatherKitData = await getAppleWeatherForecast(location);

                    const weatherData = {
                        temperature: weatherKitData.temperature,
                        // aggiungi qui eventuali altri dati da pubblicare
                    };

                    await publish(app, weatherData, settings);
                    console.log("✅ Dati meteo pubblicati con successo");
                } catch (error) {
                    app.error(`WEATHER UPDATE FAIL: ${error.message}, ${error}`);
                }
            };

            // Ascolta aggiornamenti sulla posizione
            const locationStreamPath = app.streambundle.getSelfStream("navigation.position");
            unsubPos = locationStreamPath.onValue((pos) => {
                if (pos && pos.latitude && pos.longitude) {
                    location = pos;

                    // Se è la prima volta che otteniamo una posizione, avvia subito il primo aggiornamento
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
                    title: "API per dati metereologici",
                    default: "appleWeather",
                    enum: ["unspecified", "openMeteo", "appleWeatherKit"],
                    enumNames: ["Unspecified", "OpenMeteo", "Apple WeatherKit"],
                    description: "Scegli se usare OpenMeteo o Apple WeatherKit per ottenere i dati sulle condizioni meteo nella posizione dell'imbarcazione",
                },
            },


        }),

        registerWithRouter: (router) => {
            setupRoutes(router, lastCallRef);
        },

        getOpenApi: getOpenApiSpec,
    };

    return plugin;
};
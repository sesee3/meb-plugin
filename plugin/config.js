const dotenv = require("dotenv");
const path = require("path");

// Carica il file .env dalla root del plugin
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const config = {
    teamId: process.env.WEATHERKIT_TEAM_ID,
    serviceId: process.env.WEATHERKIT_SERVICE_ID,
    keyId: process.env.WEATHERKIT_KEY_ID,

    authPath: process.env.WEATHERKIT_AUTH_FILE,
    stormglassApiKey: process.env.STORMGLASS_API_KEY,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    language: "it",
    timezone: "Europe/Rome",
};

function validateConfig() {
    // WeatherKit è opzionale: se mancano variabili, disabilitiamo solo la parte meteo
    const requiredWeather = ["teamId", "serviceId", "keyId", "authPath"]; 
    const missingWeather = requiredWeather.filter((key) => !config[key]);

    if (missingWeather.length > 0) {
        console.warn(
            `[MEB CONFIG] Variabili WeatherKit mancanti: ${missingWeather.join(", ")} - la sezione meteo verrà disabilitata.`
        );
    }

    if (!config.telegramBotToken) {
        console.warn("[MEB CONFIG] TELEGRAM_BOT_TOKEN non impostato: il bot Telegram verrà disabilitato.");
    }
}

module.exports = { config, validateConfig };
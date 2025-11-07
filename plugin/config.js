const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const config = {
    teamId: process.env.WEATHERKIT_TEAM_ID,
    serviceId: process.env.WEATHERKIT_SERVICE_ID,
    keyId: process.env.WEATHERKIT_KEY_ID,
    authPath: process.env.WEATHERKIT_AUTH_FILE,
    stormglassApiKey: process.env.STORMGLASS_API_KEY,
    language: "it",
    timezone: "Europe/Rome",
};

function validateConfig() {
    const required = ['teamId', 'serviceId', 'keyId', 'authPath'];
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

module.exports = { config, validateConfig };
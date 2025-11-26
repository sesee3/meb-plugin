const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { config } = require("../config.js");

let jwtToken = "";

function generateToken() {
    if (!config.teamId || !config.serviceId || !config.keyId || !config.authPath) {
        throw new Error("WeatherKit non configurato correttamente (mancano variabili env).");
    }

    console.log(`[WeatherKit] Using key file: ${config.authPath}, keyId: ${config.keyId}`);

    // authPath relativo alla root del progetto (dove sta .env e il .p8)
    const privateKeyPath = path.resolve(__dirname, "..", "..", config.authPath);
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expirationTime = nowInSeconds + 31536000; // 1 anno

    const headers = {
        alg: "ES256",
        kid: config.keyId,
        id: `${config.teamId}.${config.serviceId}`, // TeamID.ServiceID
    };

    const payload = {
        iss: config.teamId,
        iat: nowInSeconds,
        exp: expirationTime,
        sub: config.serviceId,
    };

    jwtToken = jwt.sign(payload, privateKey, {
        algorithm: "ES256",
        header: headers,
    });

    console.log("[WeatherKit] Developer token generato.");
}

async function getForecast(location) {

        if (!jwtToken) {
            generateToken();
        }

    const dataSets = ["currentWeather"];
    const url = `https://weatherkit.apple.com/api/v1/weather/${config.language}/${location.latitude}/${location.longitude}?dataSets=${dataSets.join(",")}&timezone=${encodeURIComponent(config.timezone)}`;

    const response = await axios.get(url, {
        headers: { 
            Authorization: `Bearer ${jwtToken}`
        },
        timeout: 15000,
        validateStatus: () => true,
    });

    const data = response.data;

    if (!data || !data.currentWeather) {
        throw new Error("WeatherKit: campo currentWeather mancante nella risposta JSON.");
    }

    return {
        temperature: data.currentWeather.temperature,
        rain: data.currentWeather.precipitationIntensity,
        windSpeed: data.currentWeather.windSpeed,
        windDirection: data.currentWeather.windDirection,
    };
}

module.exports = {
    getAppleWeatherForecast: getForecast,
};
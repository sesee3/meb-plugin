const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { config } = require("./config.js");

var jwtToken = "";

function generateToken() {
    const privateKeyPath = path.resolve(__dirname, '..', config.authPath);
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");

    const headers = {
        alg: "ES256",
        kid: config.keyId,
        id: `${config.teamId}.${config.serviceId}`,
    };

const nowInSeconds = Math.floor(Date.now() / 1000);
const expirationTime = nowInSeconds + 31536000; // 1y

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
}

async function getForecast(location) {
    if (!jwtToken) {
        generateToken();
    }
    const dataSets = ["currentWeather"];
    const url = `https://weatherkit.apple.com/api/v1/weather/${config.language}/${location.latitude}/${location.longitude}?dataSets=${dataSets.join(",")}&timezone=${encodeURIComponent(config.timezone)}`;

    const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${jwtToken}` },
        timeout: 15000,
    });

    console.log(data)

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
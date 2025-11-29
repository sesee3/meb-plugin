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

    console.log(`[WeatherKit] Developer token generato., ${jwtToken}`);
}

async function getForecast(location) {
    if (!jwtToken) {
        generateToken();
    }

    console.log(`[WeatherKit] Richiesta meteo per lat=${location.latitude}, lon=${location.longitude}`);

    // Richiedi più dataset per aumentare probabilità di dati disponibili
    const dataSets = ["currentWeather"];
    const url = `https://weatherkit.apple.com/api/v1/weather/${encodeURIComponent(config.language)}/${location.latitude}/${location.longitude}?dataSets=${dataSets.join(",")}&timezone=${encodeURIComponent(config.timezone)}`;

    const response = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${jwtToken}`
        },
        timeout: 20000,
        validateStatus: () => true,
    });

    // Gestione errori HTTP
    if (response.status < 200 || response.status >= 300) {
        const message = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        throw new Error(`WeatherKit HTTP ${response.status}: ${message}`);
    }

    const data = response.data || {};

    // Prova parsing "currentWeather"
    let current = data.currentWeather || data?.currentWeather?.data || null;
    if (Array.isArray(current)) current = current[0] || null;

    // Se manca current, usa il primo elemento di forecastHourly come fallback
    if (!current && Array.isArray(data.forecastHourly)) {
        const h0 = data.forecastHourly[0];
        if (h0) {
            current = {
                temperature: h0.temperature,
                precipitationIntensity: h0.precipitationIntensity,
                windSpeed: h0.windSpeed,
                windDirection: h0.windDirection,
            };
        }
    }

    // Se ancora non disponibile, fallback sicuro
    if (!current) {
        throw new Error("WeatherKit: currentWeather non disponibile e nessun fallback utile.");
    }

    // Normalizza campi
    const temperature = current.temperature ?? null;
    const rain = current.precipitationIntensity ?? current.precipitation ?? null;
    const windSpeed = current.windSpeed ?? null;
    const windDirection = current.windDirection ?? null;

    return {
        temperature,
        rain,
        windSpeed,
        windDirection,
    };
}

module.exports = {
    getAppleWeatherForecast: getForecast,
};
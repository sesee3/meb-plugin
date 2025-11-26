const { getAppleWeatherForecast } = require("../api_models/weatherkit.js");
const { getStormGlassForecasts } = require("../api_models/stormglass.js");

function generateValues(data, prefix = "meb") {
    const values = [];

    function traverse(obj, pathParts) {
        for (const key in obj) {
            if (obj[key] === undefined || obj[key] === null) continue;

            const newPath = [...pathParts, key];

            if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
                traverse(obj[key], newPath);
            } else {
                values.push({
                    path: newPath.join("."),
                    value: obj[key],
                    meta: { displayName: key },
                });
            }
        }
    }

    traverse(data, [prefix]);
    return values;
}

function publishWeatherData(app, weatherData, settings) {
    const values = generateValues(weatherData);

    console.debug("📤 Dati generati per la pubblicazione:", values);

    app.handleMessage("meb", {
        updates: [{ values }],
    });
}

module.exports = { publish: publishWeatherData };
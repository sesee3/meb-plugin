const { getAppleWeatherForecast } = require("./weatherkit.js");
const { getStormGlassForecasts } = require("./stormglass.js");

function publishWeatherData(app, weatherData, settings) {
    const values = [
        {
            path: "meb.forecast.temperature",
            value: weatherData.temperature,
            meta: { units: "c", displayName: "Temperatura" },
        },
        {
            path: "meb.forecast.pressure",
            value: weatherData.pressure,
            meta: { units: "hPa", displayName: "Pressione" },
        },
        {
            path: "meb.forecast.rain",
            value: weatherData.rain,
            meta: { units: "mm", displayName: "Pioggia" },
        },
        {
            path: "meb.forecast.wind.speed",
            value: weatherData.windSpeed,
            meta: { units: "km/s", displayName: "Velocità del Vento" },
        },
        {
            path: "meb.forecast.wind.direction",
            value: weatherData.windDirection,
            meta: {
                units: "", displayName: "Direzione del Vento"
            }
        },
        {
            path: "meb.apiType",
            value: settings?.apiType || "appleWeatherKit",
        },
        {
            path: "mebw.refreshTimer",
            value: 60,
        },
    ];

    app.handleMessage("meb", {
        updates: [{ values }],
    });
}

module.exports = { publish: publishWeatherData };
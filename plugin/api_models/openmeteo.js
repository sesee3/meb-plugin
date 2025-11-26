const fs = require('fs');
const axios = require('axios');
const { config } = require("../config.js");

async function getForecast(latitude, longitude) {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,pressure_msl,rain,precipitation,wind_speed_10m`;

    try {
        const response = await axios.get(api, {
            headers: {
                Accept: "application/json, text/plain;q=0.9,*/*;q=0.8"
            },
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status === 200 // Only accept 200 as valid
        });

        const { data } = response;

        // Extract units
        const {
            temperature_2m: temperatureUnit,
            pressure_msl: pressureUnit,
            wind_speed_10m: windUnit,
            rain: rainUnit
        } = data.current_units;

        // Extract forecast data
        const {
            temperature_2m: temperature,
            pressure_msl: pressure,
            rain,
            wind_speed_10m: windSpeed
        } = data.current;


        return {
            temperature,
            pressure,
            rain,
            wind: windSpeed,
            units: {
                temperature: temperatureUnit,
                pressure: pressureUnit,
                rain: rainUnit,
                wind: windUnit
            }
        };
    } catch (error) {
        if (error.response) {
            // Server responded with error status
            console.error(
                `FORECAST REQUEST FAILED: ${error.response.status} - ${error.response.statusText}`
            );
        } else if (error.request) {
            // Request made but no response
            console.error(`FORECAST REQUEST FAILED: No response received - ${error.message}`);
        } else {
            // Error setting up request
            console.error(`FORECAST REQUEST FAILED: ${error.message}`);
        }
        throw error; // Re-throw to let caller handle it
    }
}
function extractForecastData(weatherResponse) {
    const current = weatherResponse;

    return {
        temperature: current.temperature,
        pressure: current.pressure,
        rain: current.precipitationIntensity,
        windSpeed: current.windSpeed,
    };
}

// async function buildWith(settings) {
//     const location = app.getSelfPath("navigation.position");
//
//     if (!location?.latitude || !location?.longitude) {
//         if (app.debug) {
//             app.debug(
//                 "La posizione non è ancora disponibile. Gli aggiornamenti riprenderanno a breve"
//             );
//         }
//         return null;
//     }
//
//     try {
//         const forecast = await getOpenMeteoForecast(
//             location.latitude,
//             location.longitude
//         );
//         publish(forecast, settings);
//         return forecast;
//     } catch (error) {
//         console.error("Failed to build forecast:", error.message);
//         return null;
//     }
// }

module.exports = { buildWith };
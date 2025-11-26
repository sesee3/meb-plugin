const axios = require('axios');
const { config } = require("../config.js");
const fs = require("fs");
const path = require("path");

const { getDate, relativeData } = require("../tools/utils.js");

// let location = {
//     latitude: 38.17937,
//     longitude: 15.56699,
// }

// function setLocation(newLoc) {
//     location = newLoc;
// }

const apiKey = config.stormglassApiKey;
const provider = "sg";

async function getStormGlassWeather(location) {

    const params = "waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,currentSpeed,currentDirection,swellHeight,swellDirection,swellPeriod";
    const url = `https://api.stormglass.io/v2/weather/point?lat=${location.latitude}&lng=${location.longitude}&params=${params}`;

    const { data } = await axios.get(url, {
        headers: {
            Authorization: config.stormglassApiKey,
        },
        timeout: 15000,
    });


    const now = new Date();
    let closestHour = data.hours.reduce((prev, curr) => {
        return Math.abs(new Date(curr.time) - now) < Math.abs(new Date(prev.time) - now) ? curr : prev;
    });


    //meb.*.currents_


    // Costruisci il risultato per l'ora più vicina
    let result = {
        timestamp: closestHour.time,
        relativeData: relativeData(closestHour.time),
        date: getDate(closestHour.time),
        waves: {
            height: closestHour.waveHeight?.[provider],
            period: closestHour.wavePeriod?.[provider],
            direction: closestHour.waveDirection?.[provider]
        },
        wind: {
            speed: closestHour.windSpeed?.[provider],
            direction: closestHour.windDirection?.[provider],
        },
        swell: {
            height: closestHour.swellHeight?.[provider],
            direction: closestHour.swellDirection?.[provider],
            period: closestHour.swellPeriod?.[provider],
        },
        currents: {
            speed: closestHour.currentSpeed?.[provider],
            direction: closestHour.currentDirection?.[provider],
        }
    };

    console.log(result)
    console.log(`STORMGLASS QUOTA EXCEEDING COUNTER: ${data.meta.requestCount}/10`);

    return result;

}

module.exports = {
    getStormGlassWeather
};

const axios = require('axios');
const { config } = require("./config.js");

const { getDate, relativeData } = require("./utils.js");

// let location = {
//     latitude: 38.25128,
//     longitude: 15.62097,
// };

let location = {
    latitude: 38.17937,
    longitude: 15.56699,
}

const apiKey = config.stormglassApiKey;
const provider = "sg";

async function getStormGlassWeather() {

    const params = "waveHeight,wavePeriod,waveDirection,windSpeed,windDirection,currentSpeed,currentDirection,swellHeight,swellDirection,swellPeriod";
    const url = `https://api.stormglass.io/v2/weather/point?lat=${location.latitude}&lng=${location.longitude}&params=${params}`;

    const { data } = await axios.get(url, {
        headers: {
            Authorization: "ba4e5eca-bbd4-11f0-a148-0242ac130003-ba4e5f60-bbd4-11f0-a148-0242ac130003"
        },
        timeout: 15000,
    });

    for (const hour of data.hours) {
        let result = {
            timestamp: hour.time,
            relativeData: relativeData(hour.time),
            date: getDate(hour.time),
            waves: {
                height: hour.waveHeight?.[provider],
                period: hour.wavePeriod?.[provider],
                direction: hour.waveDirection?.[provider]
            },
            wind: {
                speed: hour.windSpeed?.[provider],
                direction: hour.windDirection?.[provider],
            },
            swell: {
                height: hour.swellHeight?.[provider],
                direction: hour.swellDirection?.[provider],
                period: hour.swellPeriod?.[provider],
            },
            currents: {
                speed: hour.currentSpeed?.[provider],
                direction: hour.currentDirection?.[provider],
            }
        };

        console.log(result);



    }

    console.log(`STORMGLASS QUOTA EXCEEDING COUNTER: ${data.meta.requestCount}/10`);

}

module.exports = {
    getStormGlassWeather
};


# Apple Weathers's APIs.
Questa è una lista di template dei dati restituiti dall'API di Apple Meteo.


## Current Forecast


``` json
{
  "currentWeather": {
    "name": "CurrentWeather",
    "metadata": {
      "attributionURL": "https://developer.apple.com/weatherkit/data-source-attribution/",
      "expireTime": "2025-10-22T14:03:16Z",
      "latitude": 38.18,
      "longitude": 15.55,
      "readTime": "2025-10-22T13:58:16Z",
      "reportedTime": "2025-10-22T13:58:16Z",
      "units": "m",
      "version": 1,
      "sourceType": "modeled"
    },
    "asOf": "2025-10-22T13:58:16Z",
    "cloudCover": 0.85,
    "cloudCoverLowAltPct": 0.33,
    "cloudCoverMidAltPct": 0.32,
    "cloudCoverHighAltPct": 0.74,
    "conditionCode": "MostlyCloudy",
    "daylight": true,
    "humidity": 0.69,
    "precipitationIntensity": 0,
    "pressure": 1010.48,
    "pressureTrend": "steady",
    "temperature": 22.47,
    "temperatureApparent": 21.77,
    "temperatureDewPoint": 16.5,
    "uvIndex": 1,
    "visibility": 27179.13,
    "windDirection": 322,
    "windGust": 18.86,
    "windSpeed": 10.95
  }
}
```
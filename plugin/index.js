const fetch = import("node-fetch");
const fs = import("fs");
const path = import("path");
const jwt = import("jsonwebtoken"); //per firmare le chiavi delle getOpenApi
const axios = import("axios");
const dotenv = import("dotenv");

//WeatherAPI Authorization Paramters
const teamID = process.env.WEATHERKIT_TEAM_ID;
const serviceID = process.env.WEATHERKIT_SERVICE_ID;
const keyID = process.env.WEATHERKIT_KEY_ID;
const authPath = process.env.WEATHERKIT_AUTH_FILE;

module.exports = function (app) {
  //TODO: Aggiungere last call e
  // let lastCall = null;
  // let updateTimer = null;
  // let unsubPos = null;
  //

  //Parametri configurabili dalle impostazioni del plugin
  var lang; //"it"
  var timezone; //"Europe/Rome"

  const publish = ({ temperature, pressure, rain, wind }, settings) => {
    const values = [
      {
        path: "mebweather.forecast.temperature",
        value: temperature,
        meta: { units: "c", displayName: "Temperatura" },
      },
      {
        path: "mebweather.forecast.pressure",
        value: pressure,
        meta: { units: "hPa", displayName: "Pressione" },
      },
      {
        path: "mebweather.forecast.rain",
        value: rain,
        meta: { units: "mm", displayName: "Pioggia" },
      },
      {
        path: "mebweather.forecast.wind.speed",
        value: wind,
        meta: { units: "km/s", displayName: "Velocità del Vento" },
      },
      {
        path: "mebweather.apiType",
        value: (settings && settings.apiType) || "unspecified",
      },
      {
        path: "mebweather.longitude",
        value: (settings && settings.latPosition) || 0,
      },
      {
        path: "mebweather.latitude",
        value: (settings && settings.lonPosition) || 0,
      },
      {
        path: "mebweather.refreshTimer",
        value: 60,
      },
    ];

    app.handleMessage("meb-weather", {
      context: "self",
      updates: [{ values }],
    });
  };

  const plugin = {
    id: "meb-weather",
    name: "MEB's Weather Plugin",

    start: async (settings) => {
      const updater = Math.max(
        10,
        Number((settings && settings.updaterInterval) ?? 60),
      );

      //TODO: Primo tentativo all'avvio
      await buildAppleWeatherForecastWith(settings);
      // await forecastForLocation(settings);

      updateTimer = setInterval(() => {
        //TODO: Publish
        buildAppleWeatherForecastWith(settings).catch(
          (e) => app.error && app.error(e.message),
        );
      }, updater * 1000);

      //Il percorso di SignalK sul quale vengono pubblicate le coordinate
      const locationStreamPath = app.streambundle.getSelfStream(
        "navigation.position",
      );

      unsubPos = locationStreamPath.onValue();
    },

    stop: async () => {
      if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
      }

      if (typeof unsubPos === "function") {
        unsubPos();
        unsubPos = null;
      }
    },

    schema: () => ({
      type: "object",
      required: ["apiKey"],
      properties: {
        updaterInterval: {
          type: "number",
          title: "Frequenza aggiornamenti",
          default: 120,
          minimum: 60,
          description:
            "Scegli ogni quanti secondi i dati meteo si aggiorneranno. (Vedi i limiti di chiamate del tuo piano per ricevere sempre aggiornamenti). Max. 500.000 chimate al mese",
        },
      },
    }),

    // Solo per test
    registerWithRouter: (router) => {
      router.get("/ping", async (req, res) => {
        try {
          const text = lastCall ?? "ciao";
          res.status(200).json({ message: text });
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      });
    },

    getOpenApi: () => ({
      openapi: "3.0.0",
      info: { title: "MebWeather API Portal", version: "1.0.0" },
      servers: [{ url: "/plugins/meb-weather" }],
      paths: {
        "/ping": {
          get: {
            summary: "Called /ping route",
            responses: {
              200: {
                description: "OK",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { message: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  };

  return plugin;
};

//############ OPENMETEO
async function getOpenMeteoForecast(latitude, longitude) {
  const api =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,pressure_msl,rain,precipitation,wind_speed_10m`;
  try {
    const res = await fetch(api, {
      headers: { Accept: "application/json, text/plain;q=0.9,*/q=0.8" },
    });

    if (!res.ok) {
      throw new Error(
        `FORECAST REQUEST FAIL ${res.status} ----- ${res.statusText}`,
      );
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();

      // UNITS (da vedere se si possono usare per migliroare la lettura dei dati)
      const temperatureUnit = data.current_units.temperature_2m;
      const pressureUnit = data.current_units.pressure_msl;
      const windUnit = data.current_units.wind_speed_10m;
      const rainUnit = data.current_units.rain;

      //Forecast Datas
      const temperature = data.current.temperature_2m;
      const pressure = data.current.pressure_msl;
      const rain = data.current.rain;
      const windSpeed = data.current.wind_speed_10m;

      console.log(
        `-------FORECAST STREAM------- LON: ${longitude} Temp: ${temperature}${temperatureUnit}, Pressure: ${pressure}${pressureUnit}, Rain: ${rain}${rainUnit}, Wind: ${windSpeed}${windUnit}`,
      );

      return {
        temperature: temperature,
        pressure: pressure,
        rain: rain,
        wind: windSpeed,
      };
    } else {
      const text = await res.text();
      console.log("FORECAST TEXT", text);
    }
  } catch (error) {
    console.error(`FORECAST REQUEST FAILED: ${error}`);
  }
}

//Crea un template da inviare a SignalK con i dati meteo della posizione specificata
async function buildOpenMeteoForecastWith(settings) {
  const location = app.getSelfPath("navigation.position");

  if (!location || location.latitude == null || location.longitude == null) {
    if (app.debug)
      app.debug(
        "La posizione non è ancora disponibile. Gli aggiornamenti riprenderanno a breve",
      );
    return;
  }

  const forecast = await getOpenMeteoForecast(
    location.latitude,
    location.longitude,
  );
  publish(forecast, settings);
}

//############ APPLE WEATHER

function getAppleWeatherToken() {
  try {
    const privateKey = fs.readFileSync(`./${authPath}`, "utf8");

    const headers = {
      alg: "ES256",
      kid: keyID,
      id: `${teamID}.${serviceID}`,
    };

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expirationTime = nowInSeconds + 604.8; //7 days

    const payload = {
      iss: teamID,
      iat: nowInSeconds,
      exp: expirationTime,
      sub: serviceID,
    };

    const token = jwt.sign(payload, privateKey, {
      algorithm: "ES256",
      header: headers,
    });

    console.log(token);

    return token;
  } catch (error) {
    console.error("Errore durante la generazione del JWT:", error.message);
  }
}

async function getAppleWeatherForecast(lat, lon) {
  const token = getToken();
  const dataSets = ["currentWeather"];
  const url = `https://weatherkit.apple.com/api/v1/weather/${LANG}/${lat}/${lon}?dataSets=${dataSets.join(",")}&timezone=${encodeURIComponent(TIMEZONE)}`;

  console.log(url);

  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return data;
}

async function buildAppleWeatherForecastWith(settings) {
  const location = app.getSelfPath("navigation.position");

  if (!location || location.latitude == nill || location.longitude == null) {
    app.debug("UNKNWON LOCATION, COORDINATES NOT AVAILABLE");
    return;
  }

  const forecast = await getAppleWeatherForecast(
    location.latitude,
    location.longitude,
  );
  //ONLY CURRENT
  console.log("Current Apple Weather Forecast");

  const currentForecast = forecast.currentWeather;
  //Currents
  const windSpeed = currentForecast.windSpeed;
  const temperature = current.temperature;
  const pressure = current.pressure;
  const rain = current.precipitationIntensity;

  const forecastDataset = {
    temperature: temperature,
    pressure: pressure,
    rain: rain,
    wind: windSpeed,
  };

  publish(forecastDataset, settings);
}

module.exports.openMeteoForecast = getOpenMeteoForecast();

"use strict";

const fetch = require("node-fetch");

// CommonJS export: factory del plugin
module.exports = function (app) {
  let lastCall = null;
  let updateTimer = null;
  let unsubPos = null;

  // Template che pubblica i dati su Signal K
  const emitForecastFrom = (
    { temperature, pressure, rain, wind },
    settings,
  ) => {
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
    ];

    app.handleMessage("meb-weather", {
      context: "vessels.self",
      updates: [{ values }],
    });
  };

  async function forecastForLocation(settings) {
    const location = app.getSelfPath("navigation.position");

    if (!location || location.latitude == null || location.longitude == null) {
      if (app.debug)
        app.debug(
          "La posizione non è ancora disponibile. Gli aggiornamenti riprenderanno a breve",
        );
      return;
    }

    const forecast = await module.exports.getCurrentForecast(
      location.latitude,
      location.longitude,
    );
    emitForecastFrom(forecast, settings);
  }

  const plugin = {
    id: "meb-weather",
    name: "MEB's Weather",

    start: async (settings) => {
      const updater = Math.max(
        10,
        Number((settings && settings.updaterInterval) ?? 60),
      );

      // Primo tentativo all'avvio
      await forecastForLocation(settings);

      updateTimer = setInterval(() => {
        forecastForLocation(settings).catch(
          (e) => app.error && app.error(e.message),
        );
      }, updater * 1000);

      // Aggiorna ad ogni update della posizione
      const vesselLocationStream = app.streambundle.getSelfStream(
        "navigation.position",
      );
      unsubPos = vesselLocationStream.onValue(async (location) => {
        if (
          location &&
          location.latitude != null &&
          location.longitude != null
        ) {
          console.log(
            "-----------------------------LOCATION UPDATE--------------------------------",
          );
          const forecast = await module.exports.getCurrentForecast(
            location.latitude,
            location.longitude,
          );
          emitForecastFrom(forecast, settings);
        }
      });
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

    // Proprietà di configurazione visibili nella scheda plugin
    schema: () => ({
      type: "object",
      required: ["apiKey"],
      properties: {
        lonPosition: {
          type: "number",
          title: "Latitudine",
          default: 50,
          description: "Il valore di longitudine delle coordinate",
        },
        latPosition: {
          type: "number",
          title: "Longitudine",
          default: 30,
          description: "Il valore di latitudine delle coordinate",
        },
        updaterInterval: {
          type: "number",
          title: "Frequenza aggiornamenti meteo",
          default: 60,
          minimum: 10,
          description:
            "Scegli ogni quanti secondi i dati meteo si aggiorneranno. (Vedi i limiti di chiamate del tuo piano per ricevere sempre aggiornamenti)",
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
  };

  return plugin;
};

// Funzione utility: current forecast
module.exports.getCurrentForecast = async function getCurrentForecast(
  latitude,
  longitude,
) {
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

      // UNITS (non usate direttamente qui, ma utili per logging)
      const temperatureUnit = data.current_units.temperature_2m;
      const pressureUnit = data.current_units.pressure_msl;
      const windUnit = data.current_units.wind_speed_10m;
      const rainUnit = data.current_units.rain;

      // CURRENT FORECAST ELEMENTS
      const temperature = data.current.temperature_2m;
      const pressure = data.current.pressure_msl;
      const rain = data.current.rain;
      const windSpeed = data.current.wind_speed_10m;

      console.log(
        `-------CURRENT FORECAST STREAM------- LON: ${longitude} Temp: ${temperature}${temperatureUnit}, Pressure: ${pressure}${pressureUnit}, Rain: ${rain}${rainUnit}, Wind: ${windSpeed}${windUnit}`,
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
};

// Alias come in ES module
module.exports.currentForecast = module.exports.getCurrentForecast;

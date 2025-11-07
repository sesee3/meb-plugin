# MEB SignalK Plugin

> Unapdated version
> 

---

## Indice 🇮🇹
- Introduzione
- Caratteristiche
- Requisiti
- Installazione
- Configurazione (schema delle impostazioni)
- Dati pubblicati su Signal K (percorsi / formato)
- Come funziona (lifecycle)
- API usata
- Endpoint di test
- Problemi noti e suggerimenti di correzione
- Debug e troubleshooting
- Contribuire
- Licenza

---

## Documentazione
`meb-weather` è un plugin Node.js per Signal K che interroga un'API meteo (attualmente `open-meteo.com`) per ottenere le condizioni meteo correnti in base alla posizione della barca, e pubblica i valori sul bus Signal K come aggiornamenti (deltas) per il contesto `vessels.self`.

Questo documento descrive come installare, configurare e utilizzare il plugin, oltre a fornire informazioni utili per il debug e miglioramenti suggeriti.

---

## Caratteristiche
- Richiesta delle condizioni meteo correnti (temperatura, pressione, pioggia, vento) per posizioni geografiche.
- Pubblicazione dei valori su percorsi custom sotto `mebweather.*` come aggiornamenti Signal K.
- Aggiornamenti periodici configurabili via `updaterInterval`.
- Sottoscrizione agli aggiornamenti della posizione del vessel (`navigation.position`) per effettuare nuove richieste quando la posizione cambia.
- Endpoint di test `/ping` registrato via `registerWithRouter` (sul router del plugin).

---

## Requisiti
- Node.js (versione compatibile con le dipendenze del progetto).
- Signal K server che supporti plugin Node.js.
- Dipendenza: `node-fetch` (dichiarata in `package.json`).

Il file `package.json` contiene le informazioni del pacchetto:
- `main` punta a `plugin/index.js`.
- `signalk-plugin-enabled-by-default: true` (opzionale, usato dal server Signal K).

---

## Installazione
Modalità tipiche:
1. Copiare la cartella `plugin` all'interno della directory dei plugin del tuo server Signal K (o installare il pacchetto come plugin secondo le modalità del tuo server).
2. Assicurarsi che `node_modules` sia installato correttamente (es. `npm install` nella radice del plugin / progetto).
3. Riavviare il server Signal K o abilitare il plugin tramite la UI dei plugin.

Nota: il repository contiene `package.json` con la dipendenza `node-fetch`. Se installi manualmente, esegui `npm install` nella cartella del plugin o nella radice del progetto.

---

## Configurazione
Il plugin definisce una `schema` per la configurazione che viene mostrata nella UI dei plugin di Signal K. Le proprietà osservate nel codice sono:

- `lonPosition` (number): titolo `Latitudine` (default: 50) — nota: nel codice il titolo e la proprietà sembrano scambiati, vedi "Problemi noti".
- `latPosition` (number): titolo `Longitudine` (default: 30) — nota: idem sopra.
- `updaterInterval` (number): titolo `Frequenza aggiornamenti meteo` (default: 60, min: 10) — intervallo in secondi per le chiamate periodiche all'API.

Nel codice la `schema` include inoltre `required: ["apiKey"]`. Tuttavia, il plugin non utilizza una chiave API nelle chiamate a `open-meteo.com` e `apiKey` non è definita nella lista `properties`. Vedi la sezione "Problemi noti e suggerimenti di correzione" per i dettagli e le possibili soluzioni.

---

## Dati pubblicati su Signal K (percorsi)
I valori vengono pubblicati come update tramite `app.handleMessage` con `context: "vessels.self"` e un array `values` contenente vari percorsi. La struttura attuale emessa dal plugin (come definita nella funzione `emitForecastFrom`) è:

```meb-weather/plugin/index.js#L11-55
// Estratto: array `values` pubblicati nel delta
[
  { path: "mebweather.forecast.temperature", value: temperature, meta: { units: "c", displayName: "Temperatura" } },
  { path: "mebweather.forecast.pressure",    value: pressure,    meta: { units: "hPa", displayName: "Pressione" } },
  { path: "mebweather.forecast.rain",        value: rain,        meta: { units: "mm", displayName: "Pioggia" } },
  { path: "mebweather.forecast.wind.speed",  value: wind,        meta: { units: "km/s", displayName: "Velocità del Vento" } },
  { path: "mebweather.apiType",              value: (settings && settings.apiType) || "unspecified" },
  { path: "mebweather.longitude",            value: (settings && settings.latPosition) || 0 },
  { path: "mebweather.latitude",             value: (settings && settings.lonPosition) || 0 }
]
```

Esempio di delta completo inviato via `app.handleMessage`:
- context: `vessels.self`
- updates: `[ { values: [ ... ] } ]`

Nota: i percorsi usati sono sotto il namespace `mebweather.*`, quindi sono "custom" e non standard Signal K. Se vuoi integrarlo con altre applicazioni, potresti preferire percorsi Signal K standard (es. `environment.*`).

---

## Come funziona (lifecycle)
- `start(settings)`:
  - Calcola l'intervallo `updater` (minimo 10s, default 60s).
  - Esegue un primo tentativo di `forecastForLocation(settings)` all'avvio.
  - Avvia un `setInterval` per chiamare periodicamente `forecastForLocation`.
  - Si sottoscrive allo stream `navigation.position` via `app.streambundle.getSelfStream("navigation.position")` per eseguire subito una richiesta quando la posizione cambia.

- `stop()`:
  - Pulisce il timer `updateTimer`.
  - Annulla la sottoscrizione `unsubPos` se presente.

- `forecastForLocation(settings)`:
  - Ottiene la posizione corrente tramite `app.getSelfPath("navigation.position")`.
  - Se mancano coordinate, non fa niente e registra un messaggio di debug.
  - Altrimenti chiama `getCurrentForecast(latitude, longitude)` e passa il risultato a `emitForecastFrom`.

---

## API usata
Il plugin attualmente costruisce la URL e chiama `open-meteo.com` con i parametri per ottenere i valori correnti. L'URL viene costruito così:

```meb-weather/plugin/index.js#L172-179
const api =
  `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
  `&current=temperature_2m,pressure_msl,rain,precipitation,wind_speed_10m`;
```

La funzione `getCurrentForecast`:
- Effettua una fetch dell'URL.
- Controlla lo `status` della risposta, e se OK parsing JSON.
- Legge da `data.current` i campi:
  - `temperature_2m`
  - `pressure_msl`
  - `rain`
  - `wind_speed_10m`
- Logga un messaggio con le unità lette da `data.current_units` e ritorna un oggetto con `{ temperature, pressure, rain, wind }`.

Nota: `open-meteo.com` non richiede necessariamente una API key per questo endpoint pubblico; tuttavia dipende dal servizio e dai termini. Il plugin non inserisce alcuna `apiKey` nella richiesta.

---

## Endpoint di test
Il plugin registra un endpoint di test tramite `registerWithRouter`:
- Rotta: `GET /ping` sul router del plugin. Restituisce un JSON con `{ message: <text> }`.
- Questo è utile per verificare che il router del plugin sia correttamente montato dal server Signal K.

Esempio: effettuare una richiesta al path del plugin (il path finale dipende da come il server monta il router dei plugin) e verificare la risposta.

---

## Problemi noti e suggerimenti di correzione
Nell'analisi del codice esistente (`plugin/index.js`) sono emerse alcune incongruenze che vale la pena sistemare:

1. Schema `required` include `apiKey` ma `properties` non lo definisce e il codice non usa una API key.
   - Impatto: la UI del plugin potrebbe chiedere obbligatoriamente una `apiKey` ma non è utilizzata.
   - Soluzione consigliata: rimuovere `apiKey` da `required` oppure aggiungere la proprietà `apiKey` nello `schema` e usarla nella costruzione della richiesta se necessario.

2. I nomi delle proprietà `latPosition` / `lonPosition` sembrano scambiati sia nei titoli che nei valori pubblicati:
   - Nella `schema`:
     - `lonPosition` ha `title: "Latitudine"`
     - `latPosition` ha `title: "Longitudine"`
   - Nella pubblicazione (`emitForecastFrom`) i valori assegnati a `mebweather.longitude` e `mebweather.latitude` sono rispettivamente `(settings && settings.latPosition)` e `(settings && settings.lonPosition)`. Questo è invertito.
   - Soluzione consigliata: correggere i `title` nella `schema` e/o correggere le assegnazioni in `emitForecastFrom` (scambiare `latPosition` e `lonPosition` come appropriato).

3. Unità meta irregolari:
   - `meta.units` per la temperatura è `"c"` (consigliato `"°C"` o `"C"` standard), per il vento è `"km/s"` che molto probabilmente è sbagliato (km/s è velocità estremamente elevata); l'API `open-meteo` potrebbe restituire m/s o km/h.
   - Soluzione: leggere `data.current_units` e mappare le unità correttamente, o impostare unità standard (es. `°C`, `hPa`, `mm`, `m/s`).

Suggerimento pratico: ecco un esempio di correzione per lo scambio di lat/lon e un aggiornamento delle unità (example only, non applicato al codice originale). Questo è un esempio suggerito e va adattato al contesto:

```/dev/null/suggested-fix.js#L1-40
// Esempio suggerito (non applicato al codice originale):
// - Correggere l'ordine lat/lon nella pubblicazione
// - Mettere unità più leggibili
const values = [
  {
    path: "mebweather.forecast.temperature",
    value: temperature,
    meta: { units: "°C", displayName: "Temperatura" },
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
    meta: { units: "m/s", displayName: "Velocità del Vento" },
  },
  {
    path: "mebweather.apiType",
    value: (settings && settings.apiType) || "open-meteo",
  },
  {
    path: "mebweather.longitude",
    value: (settings && settings.lonPosition) || 0,
  },
  {
    path: "mebweather.latitude",
    value: (settings && settings.latPosition) || 0,
  },
];
```

---

## Debug e troubleshooting
- Verifica i log del server Signal K: la funzione `getCurrentForecast` logga le risposte e gli errori con `console.log`/`console.error`.
- Se non ricevi aggiornamenti:
  - Controlla che la posizione (`navigation.position`) sia presente nel self-path: `app.getSelfPath("navigation.position")`.
  - Controlla che l'intervallo `updaterInterval` sia impostato correttamente. Il minimo nel codice è 10 s.
  - Verifica che il server possa raggiungere `https://api.open-meteo.com`.
- Endpoint di test: usa il `GET /ping` del router del plugin per verificare che il plugin sia presente e il router funzioni.

---

## Contribuire
- Segnala bug o suggerimenti creando issue nel repository.
- Per modifiche, crea una branch, implementa e invia una pull request. Se apporti correzioni alla `schema` o alle unità, includi test o istruzioni di verifica.

Suggerimenti di miglioramento:
- Usare percorsi Signal K standard (es. `environment` namespace) per la migliore interoperabilità.
- Aggiungere gestione degli errori più robusta e retry/backoff se l'API non risponde.
- Supportare la configurazione di endpoint API (o API key) dalla `schema` in modo esplicito.
- Rendere le unità dinamiche leggendo `data.current_units` e pubblicandole nel `meta.units`.

---

## Licenza
Il progetto contiene un `package.json` ma nessuna licenza esplicita nel repository. Prima della distribuzione, aggiungi una licenza appropriata (ad esempio MIT, Apache-2.0, ecc.) in un file `LICENSE`.

---


## Table of Contents 🇬🇧/🇺🇸
- Introduction
- Features
- Requirements
- Installation
- Configuration (settings schema)
- Published Signal K paths / data format
- How it works (lifecycle)
- API used
- Test endpoint
- Known issues and suggested fixes
- Debug & troubleshooting
- Contributing
- License

---

## Introduction
`meb-weather` is a Node.js plugin for Signal K that queries a weather API (currently `open-meteo.com`) to fetch current weather conditions based on the vessel position and publishes those values to the Signal K bus as updates (deltas) under `vessels.self`.

This document explains installation, configuration, usage, debugging and recommended fixes.

---

## Features
- Fetches current weather conditions (temperature, pressure, rain, wind) for geolocation coordinates.
- Publishes values as custom `mebweather.*` Signal K paths.
- Configurable polling interval via `updaterInterval`.
- Subscribes to `navigation.position` updates to fetch fresh data when position changes.
- Test endpoint `/ping` registered through `registerWithRouter`.

---

## Requirements
- Node.js (compatible with project dependencies).
- Signal K server that supports Node.js plugins.
- Dependency: `node-fetch` as declared in `package.json`.

`package.json` points to `plugin/index.js` as the main entry and includes the plugin metadata.

---

## Installation
Typical steps:
1. Copy the `plugin` folder into your Signal K server's plugins directory, or install the package as a plugin according to your Signal K server.
2. Ensure `node_modules` are installed (run `npm install` if needed).
3. Restart Signal K server or enable the plugin via the Signal K admin UI.

Note: `node-fetch` is declared as a dependency; install dependencies accordingly.

---

## Configuration
The plugin exposes a `schema` for the plugin settings in the Signal K UI. Observed properties in the code:

- `lonPosition` (number): labeled `Latitudine` (default 50) — likely swapped (see Known issues).
- `latPosition` (number): labeled `Longitudine` (default 30) — likely swapped.
- `updaterInterval` (number): labeled `Frequenza aggiornamenti meteo` (default 60, min 10) — polling interval in seconds.

The schema includes `required: ["apiKey"]`, but `apiKey` is not defined in `properties` and the plugin does not use an API key in requests. See Known issues for recommendations.

---

## Published Signal K Paths
The plugin publishes an array of `values` via `app.handleMessage` under the vessel context. The emitted values (as currently implemented) are:

```meb-weather/plugin/index.js#L11-55
[
  { path: "mebweather.forecast.temperature", value: temperature, meta: { units: "c", displayName: "Temperatura" } },
  { path: "mebweather.forecast.pressure",    value: pressure,    meta: { units: "hPa", displayName: "Pressione" } },
  { path: "mebweather.forecast.rain",        value: rain,        meta: { units: "mm", displayName: "Pioggia" } },
  { path: "mebweather.forecast.wind.speed",  value: wind,        meta: { units: "km/s", displayName: "Velocità del Vento" } },
  { path: "mebweather.apiType",              value: (settings && settings.apiType) || "unspecified" },
  { path: "mebweather.longitude",            value: (settings && settings.latPosition) || 0 },
  { path: "mebweather.latitude",             value: (settings && settings.lonPosition) || 0 }
]
```

Note: These are custom paths. For broader compatibility consider mapping to Signal K standard environment paths.

---

## How it works (lifecycle)
- `start(settings)`:
  - Decides `updater` interval (min 10s).
  - Performs an initial `forecastForLocation(settings)`.
  - Registers a periodic `setInterval` to call `forecastForLocation`.
  - Subscribes to `navigation.position` via `app.streambundle.getSelfStream("navigation.position")` to trigger immediate fetches on position change.

- `stop()`:
  - Clears periodic timer and unsubscribes from position updates.

- `forecastForLocation(settings)`:
  - Reads position via `app.getSelfPath("navigation.position")`.
  - If coordinates are present, calls `getCurrentForecast(lat, lon)` and then `emitForecastFrom` to publish results.

---

## API used
The plugin constructs and requests `open-meteo.com` current forecast endpoint:

```meb-weather/plugin/index.js#L172-179
const api =
  `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
  `&current=temperature_2m,pressure_msl,rain,precipitation,wind_speed_10m`;
```

`getCurrentForecast`:
- Fetches the API URL.
- Checks response status and content-type, parses JSON.
- Reads `data.current` fields (`temperature_2m`, `pressure_msl`, `rain`, `wind_speed_10m`) and returns `{ temperature, pressure, rain, wind }`.
- Logs units from `data.current_units`.

Note: `open-meteo` endpoint here does not require a key (for this usage), but that may change or differ by endpoint. The plugin does not currently send any API key.

---

## Test endpoint
A test endpoint is registered via `registerWithRouter`:
- `GET /ping` on the plugin router — returns JSON `{ message: <text> }`.
- Useful to verify router mounting.

---

## Known issues and suggested fixes
Observed from `plugin/index.js`:

1. `apiKey` required in schema but not used:
   - Remove from `required` or add `apiKey` property and use it when the API requires an authentication key.

2. Lat/Lon swapped and inconsistent titles:
   - Fix `schema` titles and the values assigned to `mebweather.latitude`/`mebweather.longitude`.

3. Units possibly incorrect:
   - The plugin sets `meta.units` to `"c"` and `"km/s"` which are nonstandard or likely wrong. Consider using `°C`, `hPa`, `mm`, `m/s` and/or use `data.current_units` from the API.

Suggested example fix (illustrative):

```/dev/null/suggested-fix-en.js#L1-40
// Suggested example corrections:
// 1) Publish lat/lon using the correct settings properties
// 2) Use clearer units
const values = [
  { path: "mebweather.forecast.temperature", value: temperature, meta: { units: "°C", displayName: "Temperature" } },
  { path: "mebweather.forecast.pressure",    value: pressure,    meta: { units: "hPa", displayName: "Pressure" } },
  { path: "mebweather.forecast.rain",        value: rain,        meta: { units: "mm", displayName: "Precipitation" } },
  { path: "mebweather.forecast.wind.speed",  value: wind,        meta: { units: "m/s", displayName: "Wind Speed" } },
  { path: "mebweather.longitude",            value: (settings && settings.lonPosition) || 0 },
  { path: "mebweather.latitude",             value: (settings && settings.latPosition) || 0 }
];
```

---

## Debug & troubleshooting
- Check Signal K server logs; `getCurrentForecast` logs API responses and errors.
- If no updates appear:
  - Confirm `navigation.position` is available via `app.getSelfPath("navigation.position")`.
  - Confirm the plugin is started and `start()` executed.
  - Check network connectivity to `open-meteo.com`.
  - Verify `updaterInterval` (min 10 seconds).
- Use the `/ping` endpoint to validate plugin router availability.

---

## Contributing
- Open issues for bugs or feature requests.
- Use branches and pull requests for changes.
- Suggested improvements: map to standard Signal K environment paths, robust error handling and retries, configurable API endpoint or API key support via the plugin `schema`.

---

## License
No license file found in repository. Add a `LICENSE` file (e.g. MIT) before publishing or distributing.

---

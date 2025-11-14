# MEB SignalK Plugin

> 
> 

---

## Indice
- Introduzione
- Caratteristiche
- Requisiti
- Installazione
- Configurazione
- Dati & Streams
- Lifecycle
- APIs
- Endpoints
---

## Documentazione
`meb-signalk` è un plugin Node.js per Signal K che comprende una serie di tools usati all'interno del sistema di bordo. Il plugin mette a disposizioni APIs, interfacce e 

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
- `signalk-plugin-enabled-by-default: true` rende visibile a SignalK il plugin

---

## Installazione
Per installare il plugin mantenedolo all'interno del Server tra gli avvii e le installazioni di plugin terzi basterà scaricarlo sulla propria macchina in una directory qualsiasi e ottenerne la relativa path.

Da terminale, nella cartella di signalk, usare il comando
bash
```
npm install ~/plugin_directory
```

---

## Configurazione
<WORKING ON>
---

## Dati pubblicati su Signal K (percorsi)
I valori vengono pubblicati come update tramite `app.handleMessage` con `context: "vessels.self"` e un array `values` contenente vari percorsi. La struttura attuale emessa dal plugin (come definita nella funzione `emitForecastFrom`) è:

json
```
// Estratto: array `values` pubblicati nel delta
{
  meb.
}
```

Esempio di delta completo inviato via `app.handleMessage`:
- context: `vessels.self`
- updates: `[ { values: [ ... ] } ]`

Nota: i percorsi usati sono sotto il namespace `meb.*`, ogni dato sostituisce l'asterisco con un singolo valore (stringa o valore numerico) 

---

## Come funziona (lifecycle)
- `start(settings)`:
  - Esegue un primo tentativo di `updateWeather` all'avvio.
  - Avvia un `setInterval` per chiamare periodicamente la funzione di `update`.
  - Si sottoscrive allo stream `navigation.position` via `app.streambundle.getSelfStream("navigation.position")` per mantenere aggiornati i valori di latitudine e longitudine dell'imbarcazione.
---

## API usata

# Forecasts, Previsioni nelle prossime ore
- OpenMeteo
- Apple WeatherKit

# Analisi delle condizioni di navigazione
- Stormglass

  # Posizione delle imbarcazioni nei dintorni
  AIIStram (via WebSocket)

- Altre API in prova

---

## Endpoint di test
<WORKING ON>
---


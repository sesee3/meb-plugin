const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, 'data.json');

/**
 * 
 * Inizializza il dataset e lo prepara per essere salvato.
 * 
 * @param {String} headers Un array di elementi nel formato di stringhe che rappresentano i tipi di dati passati.
 * @param {ReadStream} streamer Lo stream di scrittura del file.
 */
function datasetInit(headers, streamer) {
    streamer.write(headers.join(',') + '\n');
    console.log("Dataset inizializzato", headers);
}


function appendData(data, headers, streamer) {
    const row = headers.map(header => {
        const value = data[header];
        return (value !== undefined && value !== null) ? value : ''
    }).join(',');

    const buffer = streamer.write(row + '\n');
    if (!buffer) {
        console.warn("Buffer saturo, il disco è in ritardo nella scrittura");
    }

}

module.exports = {
    datasetInit,
    appendData
};
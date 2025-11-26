const fs = require('fs');
const path = require('path');


//Ottieni il percodi dal nome di una cartella, se questa non esiste, viene creata
function  getDirectory(directoryName) {
    const directoryPath = path.resolve(__dirname, directoryName);

    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    } else {
        return directoryPath;
    }
}

/**
 * Scrivi un file con
 *     @param {string} fileName - Il nome del file.
 *     @param {string} extension - L'estensione
 *     @param {string} content - Il contenuto del file.
 *     @param {string} inDirectory - Il percorso in cui scrivere il file. Se non viene specificato, il file verrà aggiunto alla cartella principale del server.
 *
 *      🧠 Esempio d’uso
 *      (async () => {
 *       await writeFileToFolder("data", "prova.json", JSON.stringify({ name: "Giuseppe", age: 17 }, null, 2));
 *      })();
 *
 */
async function write(fileName, extension, content, inDirectory) {
    try {
        const directoryPath = inDirectory ? getDirectory(inDirectory) : path.resolve(__dirname, '..');
        fs.mkdirSync(directoryPath, {recursive: true});

        const filePath = path.join(directoryPath, `${fileName}.${extension}`);
        await fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
        console.error(`Error writing file ${fileName}.${extension}:`, error);
    }
}

//Funzione per ottenere la data nel formato dd/mm/yyyy hh:mm
function getDate(isoString) {
    const date = new Date(isoString);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Funzione per ottenere il tempo relativo ("2 ore fa", "tra 4 ore")
function relativeData(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date - now; // differenza in millisecondi
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHr = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHr / 24);

    const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

    if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
    if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
    if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
    return rtf.format(diffDay, "day");
}

module.exports = {
    getDirectory,
    write,
    getDate,
    relativeData,
}
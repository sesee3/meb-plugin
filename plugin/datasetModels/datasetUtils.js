const fs = require('fs');
const path = require('path');

/**
 * Searches for a directory. If not found, creates it.
 * @param {string} dirPath - The absolute or relative path to the directory.
 * @returns {string} - The absolute path to the directory.
 */
function getDirectory(dirPath) {
    const absolutePath = path.resolve(dirPath);
    if (!fs.existsSync(absolutePath)) {
        fs.mkdirSync(absolutePath, { recursive: true });
    }
    return absolutePath;
}

/**
 * Searches for a JSON file. If not found, creates it with initialData.
 * @param {string} filePath - The absolute or relative path to the JSON file.
 * @param {object} [initialData={}] - The initial data to write if the file is created.
 * @returns {object} - The content of the file as an object.
 */
function write(filePath, initialData = {}) {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    
    getDirectory(dir);

    if (!fs.existsSync(absolutePath)) {
        fs.writeFileSync(absolutePath, JSON.stringify(initialData, null, 2), 'utf-8');
        return initialData;
    }

    try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
        throw error;
    }
}

/**
 * Scrive dati in un file JSON.
 * @param {string} filePath - Il path assoluto o relativo al file JSON.
 * @param {object} data - Gli elementi da aggiungere nel file JSON.
 */
function update(filePath, data) {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    
    getDirectory(dir);

    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Aggiunge un elemento all'array del file specificato
 * Se il file non esiste, lo crea con un array contenente l'elemento.
 * Se il file esiste ma non è un array, genera un errore.
 * @param {string} filePath - Il path del file JSON.
 * @param {any} element - L'elemento da aggiungere all'array.
 * @returns {array} - L'array aggiornato.
 */
function appendTo(filePath, element) {
    const absolutePath = path.resolve(filePath);
    let data = [];

    if (fs.existsSync(absolutePath)) {
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            data = JSON.parse(content);
        } catch (error) {
             console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
             throw error;
        }
    } else {
         // Ensure directory exists if we are creating the file
         const dir = path.dirname(absolutePath);
         getDirectory(dir);
    }

    if (!Array.isArray(data)) {
        throw new Error(`File at ${absolutePath} exists but is not a JSON array.`);
    }

    data.push(element);
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

module.exports = {
    getDirectory,
    write,
    update,
    appendTo
};

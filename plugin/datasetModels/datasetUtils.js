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
 * Searches for a file. If not found, creates it with initialData.
 * @param {string} filePath - The absolute or relative path to the file.
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

/**
 * Aggiunge un elemento a un array specifico all'interno di un oggetto JSON
 * Es: JSON = {date: "now", elements: [], security: false}
 * appendToElement(filePath, 'elements', {title: "", description: ""})
 * 
 * @param {string} filePath - Il path del file JSON.
 * @param {string} arrayKey - La chiave dell'array nell'oggetto JSON (es: 'elements').
 * @param {any} element - L'elemento da aggiungere all'array specificato.
 * @returns {boolean} - Se l'operazione è andata a buon fine, restituisce true.
 */
function appendToElement(filePath, arrayKey, element) {
    const absolutePath = path.resolve(filePath);
    let data = {};

    if (fs.existsSync(absolutePath)) {
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            data = JSON.parse(content);
        } catch (error) {
            console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
            throw error;
        }
    } else {
        const dir = path.dirname(absolutePath);
        getDirectory(dir);
        data = {};
    }

    if (!data.hasOwnProperty(arrayKey)) {
        data[arrayKey] = [];
    }
    if (!Array.isArray(data[arrayKey])) {
        throw new Error(`Property '${arrayKey}' in file at ${absolutePath} exists but is not an array.`);
    }

    data[arrayKey].push(element);
    
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
    return true
}


/**
 * Rimuove un elemento da un array specifico all'interno di un oggetto JSON
 * cercando per proprietà "name"
 * Es: JSON = {date: "now", elements: [{name: "item1"}, {name: "item2"}], security: false}
 * removeFromElement(filePath, 'elements', 'item1')
 * 
 * @param {string} filePath - Il path del file JSON.
 * @param {string} arrayKey - La chiave dell'array nell'oggetto JSON (es: 'elements').
 * @param {string} nameToRemove - Il valore della proprietà "name" dell'elemento da rimuovere.
 * @returns {object} - Oggetto con {success: boolean, removed: object|null, remaining: number}
 */
function removeFromElement(filePath, arrayKey, nameToRemove) {
    const absolutePath = path.resolve(filePath);
    let data = {};

    if (fs.existsSync(absolutePath)) {
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            data = JSON.parse(content);
        } catch (error) {
            console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
            throw error;
        }
    } else {
        throw new Error(`File at ${absolutePath} does not exist.`);
    }

    if (!data.hasOwnProperty(arrayKey)) {
        throw new Error(`Property '${arrayKey}' does not exist in file at ${absolutePath}.`);
    }
    if (!Array.isArray(data[arrayKey])) {
        throw new Error(`Property '${arrayKey}' in file at ${absolutePath} is not an array.`);
    }

    const initialLength = data[arrayKey].length;
    const indexToRemove = data[arrayKey].findIndex(item => item.name === nameToRemove);

    if (indexToRemove === -1) {
        return {
            success: false,
            removed: null,
            remaining: initialLength,
            message: `Element with name '${nameToRemove}' not found in array '${arrayKey}'.`
        };
    }

    const removedElement = data[arrayKey].splice(indexToRemove, 1)[0];
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');

    return true
}


function findInElement(filePath, arrayKey, name) {
    const absolutePath = path.resolve(filePath);
    let data = {};

    if (fs.existsSync(absolutePath)) {
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            data = JSON.parse(content);
        } catch (error) {
            console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
            throw error;
        }
    } else {
        throw new Error(`File at ${absolutePath} does not exist.`);
    }

    if (!data.hasOwnProperty(arrayKey)) {
        throw new Error(`Property '${arrayKey}' does not exist in file at ${absolutePath}.`);
    }
    if (!Array.isArray(data[arrayKey])) {
        throw new Error(`Property '${arrayKey}' in file at ${absolutePath} is not an array.`);
    }

    const index = data[arrayKey].findIndex(item => item.name === name);

    return data[arrayKey][index]
}


/**
 * Aggiorna un elemento in un array specifico all'interno di un oggetto JSON
 * cercando per proprietà "name" e sostituendolo con un nuovo elemento
 * Es: JSON = {date: "now", elements: [{name: "item1", value: 10}, {name: "item2", value: 20}]}
 * updateInElement(filePath, 'elements', 'item1', {name: "item1", value: 99})
 * 
 * @param {string} filePath - Il path del file JSON.
 * @param {string} arrayKey - La chiave dell'array nell'oggetto JSON (es: 'elements').
 * @param {string} nameToUpdate - Il valore della proprietà "name" dell'elemento da aggiornare.
 * @param {any} newElement - Il nuovo elemento che sostituirà quello trovato.
 * @returns {boolean} - True se l'operazione ha successo, false se l'elemento non è stato trovato.
 */
function updateInElement(filePath, arrayKey, nameToUpdate, newElement) {
    const absolutePath = path.resolve(filePath);
    let data = {};

    if (fs.existsSync(absolutePath)) {
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            data = JSON.parse(content);
        } catch (error) {
            console.error(`Error reading or parsing JSON file at ${absolutePath}:`, error);
            throw error;
        }
    } else {
        throw new Error(`File at ${absolutePath} does not exist.`);
    }

    if (!data.hasOwnProperty(arrayKey)) {
        throw new Error(`Property '${arrayKey}' does not exist in file at ${absolutePath}.`);
    }
    if (!Array.isArray(data[arrayKey])) {
        throw new Error(`Property '${arrayKey}' in file at ${absolutePath} is not an array.`);
    }

    const index = data[arrayKey].findIndex(item => item.name === nameToUpdate);

    if (index === -1) {
        return false;
    }

    data[arrayKey][index] = newElement;
    fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');

    return true;
}




module.exports = {
    getDirectory,
    write,
    update,
    appendToElement,
    findInElement,
    removeFromElement,
    updateInElement
};

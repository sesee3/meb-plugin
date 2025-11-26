const crypto = require("crypto");
const hexKey = "8bf1c86e04f8da457043373ca9f1d99631a66560bac440fd955476c77ba367d2";
const fs = require('fs');
const { get } = require("http");


function getKey() {
    
    if (!hexKey) {
        throw new Error("La chiave di crittografia non è definita.");
    }
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
        throw new Error("La chiave di crittografia deve essere di 16, 24 o 32 byte.");
    }
    return key;
}

/**
 * Normalizza una chiave custom a 32 byte Buffer.
 * - Se è una stringa hex di 64 caratteri, viene convertita direttamente.
 * - Se è una stringa non-hex o di lunghezza diversa, viene hashata con SHA-256.
 * - Se è un Buffer:
 *   - 32 byte: usato direttamente
 *   - altrimenti: viene hashato con SHA-256.
 * @param {string|Buffer} customKey
 * @returns {Buffer} Chiave di 32 byte.
 */
function normalizeKey(customKey) {
    if (!customKey) return getKey();

    if (typeof customKey === 'string') {
        const hexRegex = /^[0-9a-fA-F]+$/;
        if (hexRegex.test(customKey) && customKey.length === 64) {
            return Buffer.from(customKey, 'hex');
        }
        // Tratta come testo arbitrario: SHA-256 produce 32 byte
        return crypto.createHash('sha256').update(customKey, 'utf8').digest();
    }

    if (Buffer.isBuffer(customKey)) {
        if (customKey.length === 32) return customKey;
        return crypto.createHash('sha256').update(customKey).digest();
    }

    throw new Error("customKey deve essere una stringa o un Buffer");
}

function encrypt(obj) { 
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const openFile = Buffer.from(JSON.stringify(obj), 'utf8');
    const encrypted = Buffer.concat([cipher.update(openFile), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(buffer) {
    const key = getKey();

    if (buffer.length < 28) { return []; }

    const iv = buffer.slice(0, 12);
    const tag = buffer.slice(12, 28);
    const cipherText = buffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    const decypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return JSON.parse(decypted.toString('utf8'));
}   

/**
 * Genera un token esadecimale casuale. Di base sono 24 byte.
 * @param {number} bytes 
 * @returns {string} Token esadecimale generato casualmente.
 */
function generateToken(bytes = 24) {
    return crypto.randomBytes(bytes).toString('hex');
}


/**
 * Cripta un file CSV convertendolo in formato binario crittografato
 * @param {string} path - Percorso del file CSV da crittare
 * @param {string|Buffer} [customKey] - Chiave personalizzata (stringa hex o Buffer 32 byte). Se omessa, usa la chiave di default.
 * @returns {boolean} True se l'operazione ha successo, false altrimenti
 */
function encryptLog(path, customKey = null) {
    try {
        // Normalizza la chiave a 32 byte
        const key = normalizeKey(customKey);
        
        // Leggi il file CSV come testo
        const csvContent = fs.readFileSync(path, 'utf-8');
        
        // Cripta il contenuto CSV (come stringa, non JSON)
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const contentBuffer = Buffer.from(csvContent, 'utf8');
        const encrypted = Buffer.concat([cipher.update(contentBuffer), cipher.final()]);
        const tag = cipher.getAuthTag();

        const encryptedData = Buffer.concat([iv, tag, encrypted]);
        
        // Sovrascrivi il file con i dati criptati
        fs.writeFileSync(path, encryptedData);

        return true;

    } catch (error) {
        console.error("Errore durante la crittografia del file CSV:", error);
        return false;
    }
}

/**
 * Decripta un file CSV precedentemente crittato
 * @param {string} path - Percorso del file crittato
 * @param {string|Buffer} [customKey] - Chiave personalizzata (stringa hex o Buffer 32 byte). Se omessa, usa la chiave di default.
 * @returns {string|null} Contenuto CSV decrittato come stringa, o null in caso di errore
 */
function decryptLog(path, customKey = null) {
    try {

        // Leggi il file come buffer
        const encryptedBuffer = fs.readFileSync(path);

        // Rilevamento rapido: se il file sembra testo CSV non cifrato, restituisci direttamente
        if (encryptedBuffer.length >= 10) {
            const head = encryptedBuffer.slice(0, 64).toString('utf8');
            const asciiLikely = /[\r\n,;]/.test(head) && /[A-Za-z0-9]/.test(head);
            if (asciiLikely) {
                // Probabile file già in chiaro
                return encryptedBuffer.toString('utf8');
            }
        }

        if (encryptedBuffer.length < 28) {
            throw new Error("File criptato troppo corto o corrotto");
        }

        const iv = encryptedBuffer.slice(0, 12);
        const tag = encryptedBuffer.slice(12, 28);
        const cipherText = encryptedBuffer.subarray(28);

        // Prova in ordine: chiave custom normalizzata, poi chiave di default
        const candidateKeys = [normalizeKey(customKey), getKey()];
        let lastError = null;
        for (const key of candidateKeys) {
            try {
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(tag);
                const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
                return decrypted.toString('utf8');
            } catch (e) {
                lastError = e;
                continue;
            }
        }

        // Se tutte le chiavi falliscono, rilancia errore informativo
        throw new Error(`Autenticazione fallita: chiave errata o dati corrotti (${lastError?.message || 'unknown'})`);

    } catch (error) {
        console.error("Errore durante la decrittografia del file CSV:", error);
        return null;
    }
}

module.exports = { encrypt, decrypt, generateToken, encryptLog, decryptLog };
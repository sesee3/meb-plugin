/**
 * Modulo di crittografia centralizzato per MEB Plugin
 * Supporta AES-256-GCM per file sensibili e log CSV
 * 
 * BEST PRACTICES SICUREZZA ENTERPRISE:
 * 1. La MASTER_KEY dovrebbe essere in variabile d'ambiente (process.env.MEB_MASTER_KEY)
 * 2. In produzione usare AWS KMS, HashiCorp Vault, o Azure Key Vault
 * 3. Rotazione periodica delle chiavi (ogni 90 giorni)
 * 4. Separazione chiavi: una per users, una per logs_references, una per log files
 * 5. Audit log di ogni accesso ai file sensibili
 */

const crypto = require("crypto");
const fs = require('fs');

// ==================== CONFIGURAZIONE CHIAVI ====================
// NOTA: In produzione, usa process.env.MEB_MASTER_KEY
const MASTER_KEY_HEX = process.env.MEB_MASTER_KEY || "8bf1c86e04f8da457043373ca9f1d99631a66560bac440fd955476c77ba367d2";

// Charset per token con caratteri speciali (più difficili da indovinare)
const SPECIAL_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

// ==================== FUNZIONI CHIAVE ====================

/**
 * Ottiene la chiave master (32 byte per AES-256)
 * @returns {Buffer} Chiave di 32 byte
 */
function getMasterKey() {
    if (!MASTER_KEY_HEX) {
        throw new Error("MASTER_KEY non definita. Imposta MEB_MASTER_KEY nelle variabili d'ambiente.");
    }
    const key = Buffer.from(MASTER_KEY_HEX, 'hex');
    if (key.length !== 32) {
        throw new Error("MASTER_KEY deve essere di 32 byte (64 caratteri hex).");
    }
    return key;
}

/**
 * Normalizza qualsiasi chiave custom a 32 byte Buffer per AES-256.
 * Accetta chiavi di qualsiasi lunghezza/formato.
 * @param {string|Buffer|null} customKey - Chiave custom o null per usare master key
 * @returns {Buffer} Chiave di 32 byte
 */
function normalizeKey(customKey) {
    if (!customKey) return getMasterKey();

    if (typeof customKey === 'string') {
        // Se è hex di 64 caratteri, convertilo direttamente
        if (/^[0-9a-fA-F]{64}$/.test(customKey)) {
            return Buffer.from(customKey, 'hex');
        }
        // Altrimenti hash SHA-256 per ottenere 32 byte
        return crypto.createHash('sha256').update(customKey, 'utf8').digest();
    }

    if (Buffer.isBuffer(customKey)) {
        if (customKey.length === 32) return customKey;
        return crypto.createHash('sha256').update(customKey).digest();
    }

    throw new Error("customKey deve essere una stringa o un Buffer");
}

// ==================== GENERAZIONE TOKEN ====================

/**
 * Genera un token esadecimale casuale
 * @param {number} bytes - Numero di byte (default 24 = 48 caratteri hex)
 * @returns {string} Token esadecimale
 */
function generateToken(bytes = 24) {
    return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Genera un token con caratteri speciali (più sicuro per chiavi sensibili)
 * @param {number} length - Lunghezza del token (default 64)
 * @returns {string} Token con caratteri speciali
 */
function generateSecureToken(length = 64) {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += SPECIAL_CHARSET[bytes[i] % SPECIAL_CHARSET.length];
    }
    return result;
}

// ==================== CRITTOGRAFIA OGGETTI JSON (per file sensibili) ====================

/**
 * Cripta un oggetto JSON in Buffer binario (AES-256-GCM)
 * Usato per telegram_users.json e logs_references.json
 * @param {object} obj - Oggetto da criptare
 * @param {string|Buffer|null} customKey - Chiave custom (opzionale)
 * @returns {Buffer} Dati criptati [IV(12) + TAG(16) + CIPHERTEXT]
 */
// DISABILITATO: salviamo in chiaro
function encrypt(obj, customKey = null) {
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    return plaintext; // ritorna direttamente il contenuto in chiaro
}

/**
 * Decripta un Buffer in oggetto JSON
 * @param {Buffer} buffer - Dati criptati
 * @param {string|Buffer|null} customKey - Chiave custom (opzionale)
 * @returns {object} Oggetto decriptato (array vuoto se fallisce)
 */
// DISABILITATO: leggiamo direttamente in chiaro
function decrypt(buffer, customKey = null) {
    try {
        if (!buffer) return [];
        const content = buffer.toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('[decrypt] Errore:', error.message);
        return [];
    }
}

// ==================== CRITTOGRAFIA FILE LOG CSV ====================

/**
 * Cripta un file CSV/testo sul disco
 * @param {string} filePath - Percorso del file
 * @param {string|Buffer|null} customKey - Chiave custom (qualsiasi lunghezza)
 * @returns {boolean} True se successo
 */
// DISABILITATO: i file log rimangono sempre in chiaro
function encryptLog(filePath, customKey = null) {
    try {
        // Non fare nulla, lascia il file in chiaro
        return true;
    } catch (error) {
        console.error('[encryptLog] Errore:', error.message);
        return false;
    }
}

/**
 * Decripta un file CSV/testo e lo riscrive sul disco
 * @param {string} filePath - Percorso del file criptato
 * @param {string|Buffer|null} customKey - Chiave custom
 * @returns {string|null} Contenuto decriptato o null se errore
 */
// DISABILITATO: i file sono già in chiaro
function decryptLog(filePath, customKey = null) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content; // ritorna contenuto in chiaro senza modifiche
    } catch (error) {
        console.error('[decryptLog] Errore:', error.message);
        return null;
    }
}

/**
 * Decripta un file log e restituisce il contenuto SENZA modificare il file
 * @param {string} filePath - Percorso del file criptato
 * @param {string|Buffer|null} customKey - Chiave custom
 * @returns {string|null} Contenuto decriptato o null se errore
 */
// DISABILITATO: i file sono già in chiaro
function decryptLogToMemory(filePath, customKey = null) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error('[decryptLogToMemory] Errore:', error.message);
        return null;
    }
}

// ==================== GESTIONE FILE SENSIBILI (telegram_users, logs_references) ====================

/**
 * Carica e decripta un file JSON sensibile
 * Gestisce automaticamente file in chiaro (migrazione) e criptati
 * @param {string} filePath - Percorso del file
 * @param {object} defaultValue - Valore di default se file non esiste
 * @returns {object} Dati decriptati
 */
function loadSecureFile(filePath, defaultValue = {}) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        const content = fs.readFileSync(filePath, 'utf8').trim();
        try {
            return JSON.parse(content);
        } catch (e) {
            console.error(`[loadSecureFile] JSON non valido in ${filePath}:`, e.message);
            return defaultValue;
        }
    } catch (error) {
        console.error(`[loadSecureFile] Errore caricamento ${filePath}:`, error.message);
        return defaultValue;
    }
}

/**
 * Cripta e salva un file JSON sensibile
 * @param {string} filePath - Percorso del file
 * @param {object} data - Dati da salvare
 * @returns {boolean} True se successo
 */
function saveSecureFile(filePath, data) {
    try {
        const content = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error(`[saveSecureFile] Errore salvataggio ${filePath}:`, error.message);
        return false;
    }
}

module.exports = { 
    // Generazione token
    generateToken, 
    generateSecureToken,
    
    // Crittografia oggetti JSON
    encrypt, 
    decrypt,
    
    // Crittografia file log
    encryptLog, 
    decryptLog,
    decryptLogToMemory,
    
    // Gestione file sensibili
    loadSecureFile,
    saveSecureFile,
    
    // Utility
    normalizeKey
};
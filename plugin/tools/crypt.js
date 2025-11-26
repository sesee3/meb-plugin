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
function encrypt(obj, customKey = null) {
    const key = normalizeKey(customKey);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]);
}

/**
 * Decripta un Buffer in oggetto JSON
 * @param {Buffer} buffer - Dati criptati
 * @param {string|Buffer|null} customKey - Chiave custom (opzionale)
 * @returns {object} Oggetto decriptato (array vuoto se fallisce)
 */
function decrypt(buffer, customKey = null) {
    try {
        const key = normalizeKey(customKey);

        if (!buffer || buffer.length < 28) return [];

        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const cipherText = buffer.subarray(28);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
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
function encryptLog(filePath, customKey = null) {
    try {
        const key = normalizeKey(customKey);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(Buffer.from(content, 'utf8')), 
            cipher.final()
        ]);
        const tag = cipher.getAuthTag();

        fs.writeFileSync(filePath, Buffer.concat([iv, tag, encrypted]));
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
function decryptLog(filePath, customKey = null) {
    try {
        const buffer = fs.readFileSync(filePath);

        // Rileva se il file è già in chiaro (CSV/testo)
        if (buffer.length >= 10) {
            const head = buffer.subarray(0, 64).toString('utf8');
            if (/[\r\n,;]/.test(head) && /[A-Za-z0-9]/.test(head)) {
                return buffer.toString('utf8'); // Già in chiaro
            }
        }

        if (buffer.length < 28) {
            throw new Error("File troppo corto o corrotto");
        }

        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const cipherText = buffer.subarray(28);

        const key = normalizeKey(customKey);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
        const content = decrypted.toString('utf8');
        
        // Riscrivi il file decriptato sul disco
        fs.writeFileSync(filePath, content, 'utf8');
        
        return content;
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
function decryptLogToMemory(filePath, customKey = null) {
    try {
        const buffer = fs.readFileSync(filePath);

        // Rileva se il file è già in chiaro
        if (buffer.length >= 10) {
            const head = buffer.subarray(0, 64).toString('utf8');
            if (/[\r\n,;]/.test(head) && /[A-Za-z0-9]/.test(head)) {
                return buffer.toString('utf8');
            }
        }

        if (buffer.length < 28) return null;

        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const cipherText = buffer.subarray(28);

        const key = normalizeKey(customKey);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        
        return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
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
        const buffer = fs.readFileSync(filePath);
        
        // Controlla se è JSON in chiaro (migrazione da vecchio formato)
        const content = buffer.toString('utf8').trim();
        if (content.startsWith('{') || content.startsWith('[')) {
            try {
                const parsed = JSON.parse(content);
                console.log(`[loadSecureFile] File ${filePath} in chiaro, verrà criptato al prossimo salvataggio.`);
                return parsed;
            } catch {
                // Non è JSON valido, prova a decriptare
            }
        }
        
        // Prova a decriptare
        const decrypted = decrypt(buffer);
        
        // Se decrypt restituisce array vuoto ma defaultValue è un oggetto, usa defaultValue
        if (Array.isArray(decrypted) && decrypted.length === 0 && !Array.isArray(defaultValue)) {
            return defaultValue;
        }
        
        return decrypted;
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
        const buffer = encrypt(data);
        fs.writeFileSync(filePath, buffer);
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
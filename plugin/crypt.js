const crypto = require("crypto");
const hexKey = "8bf1c86e04f8da457043373ca9f1d99631a66560bac440fd955476c77ba367d2";

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

function generateToken() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = { encrypt, decrypt, generateToken };
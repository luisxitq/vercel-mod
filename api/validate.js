const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
const WS_TOKEN = "KJGMDKFJDHG34KD";
const CURRENT_VERSION = "1.0";
const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

// ── Cifrado XOR + Base64 ────────────────────────────────────────────────────

function xorEncryptDecrypt(data, key) {
    let result = '';
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function base64Encode(str) {
    return Buffer.from(str, 'binary').toString('base64');
}

function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

function encryptPayload(dataObj, key) {
    const jsonStr = JSON.stringify(dataObj);
    const encrypted = xorEncryptDecrypt(jsonStr, key);
    return base64Encode(encrypted);
}

function decryptPayload(encodedData, key) {
    try {
        const decoded = base64Decode(encodedData);
        const decrypted = xorEncryptDecrypt(decoded, key);
        return JSON.parse(decrypted);
    } catch (e) {
        return null;
    }
}

// ── Helpers Firebase ────────────────────────────────────────────────────────

function parseValidity(str) {
    try {
        const [datePart, timePart] = str.trim().split(' ');
        const [day, month, year] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        return new Date(year, month - 1, day, hours, minutes);
    } catch {
        return null;
    }
}

async function getLicense(licenseKey) {
    try {
        const res = await fetch(`\( {FIREBASE_URL}/userinfo/ \){encodeURIComponent(licenseKey)}.json`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function bindHWID(licenseKey, hwid) {
    try {
        await fetch(`\( {FIREBASE_URL}/userinfo/ \){encodeURIComponent(licenseKey)}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: hwid })
        });
    } catch {
        // No bloqueamos el login si falla el bind
    }
}

// ── Handler principal ───────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { token, data } = body || {};
        
        if (token !== WS_TOKEN || !data) {
            return res.status(400).json({ error: 'Invalid Request' });
        }
        
        const payload = decryptPayload(data, ENCRYPTION_KEY);
        if (!payload) {
            const err = encryptPayload({ status: "error", message: "Decryption failed" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        const { license_key, hwid, version } = payload;
        
        // Validar versión
        if (version !== CURRENT_VERSION) {
            const err = encryptPayload({
                status: "error",
                message: "Old version. Please update.",
                data: { version: CURRENT_VERSION }
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        if (!license_key) {
            const err = encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        // Obtener licencia
        const license = await getLicense(license_key);
        
        if (!license || license.status !== "active") {
            const err = encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        // Verificar expiración
        const expiryDate = parseValidity(license.validity);
        if (!expiryDate || isNaN(expiryDate.getTime()) || new Date() > expiryDate) {
            const err = encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        // ── Lógica HWID ───────────────────────────────────────────────────
        const storedDevice = (license.device || "").toString().trim();
        const isLocked = license.access === "1";
        const hasHWID = hwid && hwid.toString().trim().length > 0;
        
        if (isLocked) {
            if (!storedDevice || storedDevice === "null" || storedDevice === "") {
                // Primera vez → vincular HWID
                if (hasHWID) {
                    await bindHWID(license_key, hwid);
                }
            } else {
                // Ya tiene HWID → debe coincidir
                if (!hasHWID || storedDevice !== hwid) {
                    const err = encryptPayload({
                        status: "error",
                        message: "HWID mismatch. This key is locked to another device."
                    }, ENCRYPTION_KEY);
                    return res.status(200).json({ data: err });
                }
            }
        }
        
        // ── Éxito ─────────────────────────────────────────────────────────
        const success = encryptPayload({
            status: "success",
            data: {
                expiry_date: expiryDate.toISOString(),
                version: CURRENT_VERSION,
                auth_token: "VALID_TOKEN_AUTH_8BALL"
            }
        }, ENCRYPTION_KEY);
        
        return res.status(200).json({ data: success });
        
    } catch (error) {
        const err = encryptPayload({ status: "error", message: "Internal server error" }, ENCRYPTION_KEY);
        return res.status(200).json({ data: err });
    }
}
const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
const WS_TOKEN = "KJGMDKFJDHG34KD";
const CURRENT_VERSION = "1.0";
const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

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

function parseValidity(str) {
    try {
        if (!str) return null;
        const parts = str.trim().split(' ');
        if (parts.length < 2) return null;
        const [day, month, year] = parts[0].split('-').map(Number);
        const [hours, minutes] = parts[1].split(':').map(Number);
        return new Date(year, month - 1, day, hours || 0, minutes || 0);
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
    } catch {}
}

export default async function handler(req, res) const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
const WS_TOKEN = "KJGMDKFJDHG34KD";
const CURRENT_VERSION = "1.0";
const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

function xorEncryptDecrypt(data, key) {
    let result = "";
    for (let i = 0; i < data.length; i++) {
        result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

function base64Encode(str) {
    return Buffer.from(str, "binary").toString("base64");
}

function base64Decode(str) {
    return Buffer.from(str, "base64").toString("binary");
}

function encryptPayload(obj, key) {
    return base64Encode(xorEncryptDecrypt(JSON.stringify(obj), key));
}

function decryptPayload(encoded, key) {
    try {
        return JSON.parse(xorEncryptDecrypt(base64Decode(encoded), key));
    } catch (e) {
        return null;
    }
}

function parseValidity(str) {
    try {
        if (!str) return null;
        const parts = str.trim().split(" ");
        const dateParts = parts[0].split("-");
        const timeParts = (parts[1] || "00:00").split(":");
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        const hours = parseInt(timeParts[0], 10) || 0;
        const minutes = parseInt(timeParts[1], 10) || 0;
        // Crear fecha en UTC para evitar problemas de zona horaria
        return new Date(Date.UTC(year, month, day, hours, minutes, 0));
    } catch (e) {
        return null;
    }
}

async function getLicense(key) {
    try {
        const res = await fetch(FIREBASE_URL + "/userinfo/" + encodeURIComponent(key) + ".json");
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function bindHWID(key, hwid) {
    try {
        await fetch(FIREBASE_URL + "/userinfo/" + encodeURIComponent(key) + ".json", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device: hwid })
        });
    } catch (e) {}
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }
    
    try {
        const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const token = body && body.token;
        const data = body && body.data;
        
        if (token !== WS_TOKEN || !data) {
            return res.status(400).json({ error: "Invalid Request" });
        }
        
        const payload = decryptPayload(data, ENCRYPTION_KEY);
        if (!payload) {
            return res.status(200).json({
                data: encryptPayload({ status: "error", message: "Decryption failed" }, ENCRYPTION_KEY)
            });
        }
        
        let license_key = payload.license_key ? String(payload.license_key).trim().toUpperCase() : "";
        let hwid = payload.hwid ? String(payload.hwid).trim() : "";
        let version = payload.version;
        
        if (version !== CURRENT_VERSION) {
            return res.status(200).json({
                data: encryptPayload({
                    status: "error",
                    message: "Old version. Please update.",
                    data: { version: CURRENT_VERSION }
                }, ENCRYPTION_KEY)
            });
        }
        
        if (!license_key) {
            return res.status(200).json({
                data: encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY)
            });
        }
        
        const license = await getLicense(license_key);
        
        if (!license || license.status !== "active") {
            return res.status(200).json({
                data: encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY)
            });
        }
        
        // Verificar fecha
        const expiryDate = parseValidity(license.validity);
        const now = new Date();
        
        if (!expiryDate || isNaN(expiryDate.getTime()) || now.getTime() > expiryDate.getTime()) {
            return res.status(200).json({
                data: encryptPayload({ status: "error", message: "Invalid or expired license key" }, ENCRYPTION_KEY)
            });
        }
        
        // HWID Lock
        const storedDevice = (license.device || "").toString().trim();
        const isLocked = license.access === "1" || license.access === 1;
        
        if (isLocked) {
            if (!storedDevice || storedDevice === "null" || storedDevice === "") {
                if (hwid) {
                    await bindHWID(license_key, hwid);
                }
            } else {
                if (!hwid || storedDevice !== hwid) {
                    return res.status(200).json({
                        data: encryptPayload({
                            status: "error",
                            message: "HWID mismatch. This key is locked to another device."
                        }, ENCRYPTION_KEY)
                    });
                }
            }
        }
        
        // Éxito
        return res.status(200).json({
            data: encryptPayload({
                status: "success",
                data: {
                    expiry_date: expiryDate.toISOString(),
                    version: CURRENT_VERSION,
                    auth_token: "VALID_TOKEN_AUTH_8BALL"
                }
            }, ENCRYPTION_KEY)
        });
        
    } catch (error) {
        return res.status(200).json({
            data: encryptPayload({ status: "error", message: "Internal server error" }, ENCRYPTION_KEY)
        });
    }
}
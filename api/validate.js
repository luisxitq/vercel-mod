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
        const dateParts = parts[0].split('-');
        if (dateParts.length !== 3) return null;
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10);
        const year = parseInt(dateParts[2], 10);
        const timeParts = parts[1].split(':');
        const hours = parseInt(timeParts[0], 10) || 0;
        const minutes = parseInt(timeParts[1], 10) || 0;
        return new Date(year, month - 1, day, hours, minutes);
    } catch {
        return null;
    }
}

async function getLicense(licenseKey) {
    try {
        const url = FIREBASE_URL + "/userinfo/" + encodeURIComponent(licenseKey) + ".json";
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function bindHWID(licenseKey, hwid) {
    try {
        await fetch(FIREBASE_URL + "/userinfo/" + encodeURIComponent(licenseKey) + ".json", {
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
        const { token, data } = body || {};
        
        if (token !== WS_TOKEN || !data) {
            return res.status(400).json({ error: "Invalid Request" });
        }
        
        const payload = decryptPayload(data, ENCRYPTION_KEY);
        if (!payload) {
            const err = encryptPayload({ status: "error", message: "ERROR 1: Decryption failed" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        let license_key = payload.license_key;
        let hwid = payload.hwid;
        let version = payload.version;
        
        if (license_key) {
            license_key = String(license_key).trim().toUpperCase();
        }
        
        if (version !== CURRENT_VERSION) {
            const err = encryptPayload({
                status: "error",
                message: "ERROR 2: Old version. Server expects " + CURRENT_VERSION
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        if (!license_key) {
            const err = encryptPayload({ status: "error", message: "ERROR 3: Empty license key" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        const license = await getLicense(license_key);
        
        if (!license) {
            const err = encryptPayload({
                status: "error",
                message: "ERROR 4: Key not found in database -> " + license_key
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        if (license.status !== "active") {
            const err = encryptPayload({
                status: "error",
                message: "ERROR 5: Key status is " + license.status
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        const expiryDate = parseValidity(license.validity);
        const now = new Date();
        
        if (!expiryDate || isNaN(expiryDate.getTime())) {
            const err = encryptPayload({
                status: "error",
                message: "ERROR 6: Cannot parse date -> " + license.validity
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        if (now > expiryDate) {
            const err = encryptPayload({
                status: "error",
                message: "ERROR 7: Key expired on " + license.validity
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: err });
        }
        
        // HWID
        const storedDevice = (license.device || "").toString().trim();
        const isLocked = (license.access === "1" || license.access === 1);
        const hasHWID = hwid && String(hwid).trim().length > 0;
        
        if (isLocked) {
            if (!storedDevice || storedDevice === "null" || storedDevice === "") {
                if (hasHWID) {
                    await bindHWID(license_key, String(hwid).trim());
                }
            } else {
                if (!hasHWID || storedDevice !== String(hwid).trim()) {
                    const err = encryptPayload({
                        status: "error",
                        message: "ERROR 8: HWID mismatch"
                    }, ENCRYPTION_KEY);
                    return res.status(200).json({ data: err });
                }
            }
        }
        
        // SUCCESS
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
        const err = encryptPayload({
            status: "error",
            message: "ERROR 9: Server crash - " + String(error.message || error)
        }, ENCRYPTION_KEY);
        return res.status(200).json({ data: err });
    }
}
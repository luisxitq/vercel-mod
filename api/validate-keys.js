const express = require('express');
const router = express.Router();

// Configuración de llaves globales
const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
const WS_TOKEN = "KJGMDKFJDHG34KD";
const CURRENT_VERSION = "1.0";

// Algoritmos XOR + Base64
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

// Ruta POST del Panel: /api/verify-key
router.post('/verify-key', async (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { token, data } = body || {};

        if (token !== WS_TOKEN || !data) {
            return res.status(400).json({ error: 'Invalid Request' });
        }

        const payload = decryptPayload(data, ENCRYPTION_KEY);
        if (!payload) {
            const errEncrypted = encryptPayload({ status: "error", message: "Decryption failed" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: errEncrypted });
        }

        const { license_key, version } = payload;

        // Validar versión
        if (version !== CURRENT_VERSION) {
            const versionErr = encryptPayload({
                status: "error",
                message: "Old version. Please update.",
                data: { version: CURRENT_VERSION }
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: versionErr });
        }

        // --- CONSULTA AL PANEL / BASE DE DATOS ---
        // Sustituye 'getLicenseFromDB' por tu consulta real a Firebase/MySQL
        const licenseData = await getLicenseFromDB(license_key); 

        if (licenseData && licenseData.active) {
            // Verificar si la fecha actual es menor a la fecha de expiración
            const now = new Date();
            const expiry = new Date(licenseData.expiry_date);

            if (now > expiry) {
                const expiredErr = encryptPayload({
                    status: "error",
                    message: "License expired"
                }, ENCRYPTION_KEY);
                return res.status(200).json({ data: expiredErr });
            }

            const successResp = encryptPayload({
                status: "success",
                data: {
                    expiry_date: licenseData.expiry_date,
                    version: CURRENT_VERSION,
                    auth_token: "VALID_TOKEN_AUTH_8BALL"
                }
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: successResp });
        } else {
            const keyErr = encryptPayload({
                status: "error",
                message: "Invalid license key"
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: keyErr });
        }

    } catch (error) {
        const serverErr = encryptPayload({ status: "error", message: "Internal server error" }, ENCRYPTION_KEY);
        return res.status(200).json({ data: serverErr });
    }
});

module.exports = router;

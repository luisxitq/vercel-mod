const fetch = require('node-fetch');

function xorEncryptDecrypt(input, key) {
    let output = '';
    for (let i = 0; i < input.length; i++) {
        output += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return output;
}

function decryptPayload(encodedData, key) {
    try {
        const decoded = Buffer.from(encodedData, 'base64').toString('utf8');
        const decrypted = xorEncryptDecrypt(decoded, key);
        return JSON.parse(decrypted);
    } catch (e) {
        return null;
    }
}

function encryptPayload(jsonObject, key) {
    const jsonString = JSON.stringify(jsonObject);
    const encrypted = xorEncryptDecrypt(jsonString, key);
    return Buffer.from(encrypted).toString('base64');
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
    const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

    // Función auxiliar para responder SIEMPRE cifrado al C++
    const sendEncryptedResponse = (payloadObj) => {
        const encrypted = encryptPayload(payloadObj, ENCRYPTION_KEY);
        return res.status(200).json({ data: encrypted });
    };

    try {
        const { data } = req.body || {};
        if (!data) {
            return sendEncryptedResponse({ status: "error", message: "Faltan datos de envio" });
        }

        const decryptedPayload = decryptPayload(data, ENCRYPTION_KEY);
        if (!decryptedPayload) {
            return sendEncryptedResponse({ status: "error", message: "Error al desencriptar datos" });
        }

        const { license_key: key, hwid: device_id, version } = decryptedPayload;

        // Lectura en Firebase
        const response = await fetch(`${FIREBASE_URL}/userinfo/${key}.json`);
        const keyData = await response.json();

        if (!keyData) {
            return sendEncryptedResponse({ status: "error", message: "La llave no existe." });
        } 
        
        if (keyData.status !== 'active') {
            return sendEncryptedResponse({ status: "error", message: "La llave esta inactiva." });
        }

        // Validación de fecha
        const [datePart, timePart] = keyData.validity.split(' ');
        const [day, month, year] = datePart.split('-');
        const [hour, minute] = timePart.split(':');
        const expiryDate = new Date(year, month - 1, day, hour, minute);

        if (new Date() > expiryDate) {
            await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'inactive' })
            });
            return sendEncryptedResponse({ status: "error", message: "La licencia ha expirado." });
        }

        // Control HWID
        if (keyData.access === "1") {
            if (keyData.device === "null" || !keyData.device) {
                await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device: device_id })
                });
            } else if (keyData.device !== device_id) {
                return sendEncryptedResponse({ status: "error", message: "Llave registrada en otro celular." });
            }
        }

        // Si todo es correcto:
        return sendEncryptedResponse({
            status: "success",
            data: {
                expiry_date: keyData.validity,
                version: version || "1.0",
                auth_token: "PANDA_OK_AUTH"
            }
        });

    } catch (e) {
        return sendEncryptedResponse({ status: "error", message: "Error interno del servidor" });
    }
};

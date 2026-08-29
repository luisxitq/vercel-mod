const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
const WS_TOKEN = "KJGMDKFJDHG34KD";
const CURRENT_VERSION = "1.0";

// Base de datos de licencias (Licencia -> Fecha de expiración)
const VALID_KEYS = {
    "PANDA-KEY-VIP-2026": "2026-12-31T23:59:59Z",
    "TEST-KEY-123": "2026-10-01T12:00:00Z"
};

// Algoritmos de cifrado XOR + Base64 idénticos al cliente C++
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

export default async function handler(req, res) {
    // Permitir solo peticiones HTTP POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { token, data } = body || {};

        // Validar el token global del payload
        if (token !== WS_TOKEN || !data) {
            return res.status(400).json({ error: 'Invalid Request' });
        }

        // Descifrar el contenido
        const payload = decryptPayload(data, ENCRYPTION_KEY);
        if (!payload) {
            const errEncrypted = encryptPayload({ status: "error", message: "Decryption failed" }, ENCRYPTION_KEY);
            return res.status(200).json({ data: errEncrypted });
        }

        const { license_key, version } = payload;

        // Validar versión del cliente
        if (version !== CURRENT_VERSION) {
            const versionErr = encryptPayload({
                status: "error",
                message: "Old version. Please update.",
                data: { version: CURRENT_VERSION }
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: versionErr });
        }

        // Validar si la llave de licencia existe
        if (VALID_KEYS[license_key]) {
            const successResp = encryptPayload({
                status: "success",
                data: {
                    expiry_date: VALID_KEYS[license_key],
                    version: CURRENT_VERSION,
                    auth_token: "VALID_TOKEN_AUTH_8BALL"
                }
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: successResp });
        } else {
            const keyErr = encryptPayload({
                status: "error",
                message: "Invalid or expired license key"
            }, ENCRYPTION_KEY);
            return res.status(200).json({ data: keyErr });
        }
    } catch (error) {
        const serverErr = encryptPayload({ status: "error", message: "Internal server error" }, ENCRYPTION_KEY);
        return res.status(200).json({ data: serverErr });
    }
}

// Cifrado/Descifrado XOR + Base64 idéntico al Mod C++
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
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Método no permitido" });

    const ENCRYPTION_KEY = "JiM21rNU12eERlNmpqa3FuQks";
    const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

    try {
        const { token, data } = req.body || {};
        if (!data) {
            return res.status(400).json({ status: "error", message: "Datos faltantes" });
        }

        const decryptedPayload = decryptPayload(data, ENCRYPTION_KEY);
        if (!decryptedPayload) {
            return res.status(400).json({ status: "error", message: "Error al descifrar datos" });
        }

        const { license_key: key, hwid: device_id, version } = decryptedPayload;

        // Consultar Firebase Realtime Database
        const response = await fetch(`${FIREBASE_URL}/userinfo/${key}.json`);
        const keyData = await response.json();

        let responseInner = {};

        if (!keyData) {
            responseInner = { status: "error", message: "La llave no existe." };
        } else if (keyData.status !== 'active') {
            responseInner = { status: "error", message: "La llave está inactiva." };
        } else {
            // Validar expiración (Formato guardado por el Panel: DD-MM-YYYY HH:mm)
            const [datePart, timePart] = keyData.validity.split(' ');
            const [day, month, year] = datePart.split('-');
            const [hour, minute] = timePart.split(':');
            const expiryDate = new Date(year, month - 1, day, hour, minute);

            if (new Date() > expiryDate) {
                // Marcar como inactiva en Firebase si ya expiró
                await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'inactive' })
                });
                responseInner = { status: "error", message: "La licencia ha expirado." };
            } else if (keyData.access === "1") {
                // Control HWID (Dispositivo)
                if (keyData.device === "null" || !keyData.device) {
                    // Vincular dispositivo por primera vez
                    await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device: device_id })
                    });
                    responseInner = {
                        status: "success",
                        data: {
                            expiry_date: keyData.validity,
                            version: version || "1.0",
                            auth_token: "PANDA_OK_AUTH"
                        }
                    };
                } else if (keyData.device !== device_id) {
                    responseInner = { status: "error", message: "Llave en uso en otro dispositivo." };
                } else {
                    responseInner = {
                        status: "success",
                        data: {
                            expiry_date: keyData.validity,
                            version: version || "1.0",
                            auth_token: "PANDA_OK_AUTH"
                        }
                    };
                }
            } else {
                // Dispositivos ilimitados (access = ∞)
                responseInner = {
                    status: "success",
                    data: {
                        expiry_date: keyData.validity,
                        version: version || "1.0",
                        auth_token: "PANDA_OK_AUTH"
                    }
                };
            }
        }

        // Cifrar la respuesta de regreso para el Mod C++
        const encryptedResponse = encryptPayload(responseInner, ENCRYPTION_KEY);
        return res.json({ data: encryptedResponse });

    } catch (e) {
        return res.status(500).json({ status: "error", message: "Error interno en el servidor" });
    }
};

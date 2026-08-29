module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Método no permitido" });

    const { key, device_id } = req.body || {};
    if (!key || !device_id) {
        return res.status(400).json({ status: "error", message: "Faltan parámetros (key o device_id)" });
    }

    const FIREBASE_URL = "https://aimengine-62132-default-rtdb.firebaseio.com";

    try {
        const response = await fetch(`${FIREBASE_URL}/userinfo/${key}.json`);
        const data = await response.json();

        if (!data) {
            return res.json({ status: "invalid", message: "La llave no existe." });
        }

        if (data.status !== 'active') {
            return res.json({ status: "inactive", message: "La llave está inactiva." });
        }

        // Validación de expiración (DD-MM-YYYY HH:mm)
        const [datePart, timePart] = data.validity.split(' ');
        const [day, month, year] = datePart.split('-');
        const [hour, minute] = timePart.split(':');
        const expiryDate = new Date(year, month - 1, day, hour, minute);

        if (new Date() > expiryDate) {
            await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'inactive' })
            });
            return res.json({ status: "expired", message: "La licencia ha expirado." });
        }

        // Bloqueo HWID
        if (data.access === "1") {
            if (data.device === "null" || !data.device) {
                await fetch(`${FIREBASE_URL}/userinfo/${key}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device: device_id })
                });
            } else if (data.device !== device_id) {
                return res.json({ status: "device_mismatch", message: "Llave en uso en otro dispositivo." });
            }
        }

        return res.json({ status: "success", message: "Acceso concedido", validity: data.validity });
    } catch (e) {
        return res.status(500).json({ status: "error", message: "Error conectando con Firebase." });
    }
};

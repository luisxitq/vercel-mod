module.exports = async (req, res) => {
    // Permitir solicitudes OPTIONS para peticiones CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ status: "error", message: "Método no permitido" });
    }

    const { key, device_id } = req.body || {};

    if (!key || !device_id) {
        return res.status(400).json({ status: "error", message: "Faltan parámetros (key o device_id)" });
    }

    // REEMPLAZA ESTA URL CON LA URL DE TU REALTIME DATABASE EN FIREBASE
    const FIREBASE_DB_URL = "https://TU_PROYECTO-default-rtdb.firebaseio.com";

    try {
        // Consultar el nodo de la llave en Firebase vía REST API
        const response = await fetch(`${FIREBASE_DB_URL}/userinfo/${key}.json`);
        const data = await response.json();

        if (!data) {
            return res.json({ status: "invalid", message: "La llave ingresada no existe." });
        }

        // 1. Validar Estado
        if (data.status !== 'active') {
            return res.json({ status: "inactive", message: "La llave está inactiva o suspendida." });
        }

        // 2. Validar Fecha de Expiración
        const [datePart, timePart] = data.validity.split(' ');
        const [day, month, year] = datePart.split('-');
        const [hour, minute] = timePart.split(':');
        const expiryDate = new Date(year, month - 1, day, hour, minute);

        if (new Date() > expiryDate) {
            // Actualizar estado a inactivo en Firebase vía PATCH
            await fetch(`${FIREBASE_DB_URL}/userinfo/${key}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'inactive' })
            });
            return res.json({ status: "expired", message: "La licencia ha expirado." });
        }

        // 3. Control de Dispositivo (HWID Lock)
        if (data.access === "1") {
            if (data.device === "null" || !data.device) {
                // Registrar este dispositivo como el dueño de la llave
                await fetch(`${FIREBASE_DB_URL}/userinfo/${key}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device: device_id })
                });
            } else if (data.device !== device_id) {
                return res.json({ status: "device_mismatch", message: "Llave en uso por otro dispositivo." });
            }
        }

        return res.json({
            status: "success",
            message: "Acceso concedido",
            validity: data.validity
        });

    } catch (error) {
        return res.status(500).json({ status: "error", message: "Error conectando con la base de datos." });
    }
};

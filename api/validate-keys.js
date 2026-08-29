import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Método no permitido" });

    const { key, device_id } = req.body || {};

    if (!key || !device_id) {
        return res.status(400).json({ status: "error", message: "Faltan datos (key o device_id)" });
    }

    try {
        const data = await kv.hgetall(`userinfo:${key}`);

        if (!data) {
            return res.json({ status: "invalid", message: "La llave no existe." });
        }

        // 1. Validar Estado
        if (data.status !== 'active') {
            return res.json({ status: "inactive", message: "La llave está inactiva o suspendida." });
        }

        // 2. Validar Expiración (DD-MM-YYYY HH:mm)
        const [datePart, timePart] = data.validity.split(' ');
        const [day, month, year] = datePart.split('-');
        const [hour, minute] = timePart.split(':');
        const expiryDate = new Date(year, month - 1, day, hour, minute);

        if (new Date() > expiryDate) {
            await kv.hset(`userinfo:${key}`, { status: 'inactive' });
            return res.json({ status: "expired", message: "La licencia ha expirado." });
        }

        // 3. Control de Dispositivo (HWID Lock)
        if (data.access === "1") {
            if (data.device === "null" || !data.device) {
                // Bloquear la llave para este celular en su primer uso
                await kv.hset(`userinfo:${key}`, { device: device_id });
            } else if (data.device !== device_id) {
                return res.json({ status: "device_mismatch", message: "Esta llave ya está vinculada a otro celular." });
            }
        }

        return res.json({
            status: "success",
            message: "Acceso concedido",
            validity: data.validity
        });

    } catch (error) {
        return res.status(500).json({ status: "error", message: "Error interno del servidor." });
    }
}

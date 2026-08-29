import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // OBTENER TODAS LAS LLAVES (Para mostrar en el Panel)
    if (req.method === 'GET') {
        try {
            const keys = await kv.keys('userinfo:*');
            const result = {};
            
            for (const k of keys) {
                const cleanKey = k.replace('userinfo:', '');
                result[cleanKey] = await kv.hgetall(k);
            }
            
            return res.status(200).json(result);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // CREAR UNA NUEVA LLAVE (Desde el Panel)
    if (req.method === 'POST') {
        const { key, validity, access, status, rgtime } = req.body;
        
        if (!key) return res.status(400).json({ error: "Falta la llave" });

        await kv.hset(`userinfo:${key}`, {
            status: status || "active",
            validity: validity,
            access: access,
            device: "null",
            rgtime: rgtime
        });

        return res.status(200).json({ success: true });
    }

    // ELIMINAR LLAVE (Desde el Panel)
    if (req.method === 'DELETE') {
        const { key } = req.body;
        await kv.del(`userinfo:${key}`);
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
}

const { createClient } = require('@supabase/supabase-js');
const { Telegraf } = require('telegraf');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TELEGRAM_TOKEN) {
    throw new Error('Konfigurasi environment variables tidak lengkap');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

module.exports = async (req, res) => {
    // Izinkan koneksi langsung dari web frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { route_name, coordinates, assets, user_id } = req.body;

        if (!coordinates || coordinates.length < 2) {
            return res.status(400).json({ error: 'Koordinat tidak cukup' });
        }

        // 1. Format GeoJSON LineString
        const formattedCoords = coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(', ');
        const lineStringWKT = `LINESTRING(${formattedCoords})`;

        // 2. Simpan Jalur Rute
        const { data: routeData, error: routeError } = await supabase
            .from('routes')
            .insert([{ name: route_name, geom: lineStringWKT }])
            .select()
            .single();

        if (routeError) throw routeError;
        const routeId = routeData.id;

        // 3. Simpan Titik Aset via RPC
        if (assets && assets.length > 0) {
            for (const asset of assets) {
                await supabase.rpc('insert_asset_with_distance', {
                    p_route_id: routeId,
                    p_asset_type: asset.type,
                    p_lng: asset.coords[1],
                    p_lat: asset.coords[0],
                    p_desc: asset.description || `Tagging dari lapangan`
                });
            }
        }

        // 4. Tembak notifikasi sukses langsung ke chat Telegram teknisi yang menekan tombol
        if (user_id) {
            await bot.telegram.sendMessage(user_id, `✅ DATA BERHASIL DISIMPAN!\n\nNama Rute: ${route_name}\nJumlah Titik Jalur: ${coordinates.length}\nJumlah Perangkat: ${assets.length}`);
        }

        return res.status(200).json({ success: true, message: 'Data aman di Supabase' });

    } catch (err) {
        console.error('API Save Error:', err);
        return res.status(500).json({ error: err.message });
    }
};

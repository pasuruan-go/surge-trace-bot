const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

if (!process.env.TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN is missing');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

bot.start((ctx) => {
    return ctx.reply('Halo Mas Ecky! Silakan klik tombol "Buka Peta" di pojok kiri bawah untuk memulai survey rute kabel Surge.');
});

// MENANGKAP DATA YANG DIKIRIM OLEH WEB APP (tg.sendData)
bot.on('web_app_data', async (ctx) => {
    try {
        const rawData = ctx.message.web_app_data.data;
        const parsed = JSON.parse(rawData); // Mengambil payload: route_name, coordinates, assets

        // 1. FORMAT DATA KOORDINAT JALUR MENJADI LINESTRING GEOJSON
        // Format koordinat di Leaflet adalah [lat, lng], PostGIS butuh [lng, lat]
        const formattedCoords = parsed.coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(', ');
        const lineStringWKT = `LINESTRING(${formattedCoords})`;

        // 2. SIMPAN JALUR UTAMA KABEL KE TABEL routes
        const { data: routeData, error: routeError } = await supabase
            .from('routes')
            .insert([{ name: parsed.route_name, geom: lineStringWKT }])
            .select()
            .single();

        if (routeError) throw routeError;

        const routeId = routeData.id;

        // 3. JIKA ADA ASET YANG DITAGGING (UC / DWDM), SIMPAN KE TABEL node_assets
        if (parsed.assets && parsed.assets.length > 0) {
            for (const asset of parsed.assets) {
                const pointWKT = `POINT(${asset.coords[1]} ${asset.coords[0]})`;

                // Hitung otomatis jarak aset ini dari titik awal kabel menggunakan PostGIS
                // Kita gunakan query RPC atau insert mentah dengan rumus spasial
                const { error: assetError } = await supabase.rpc('insert_asset_with_distance', {
                    p_route_id: routeId,
                    p_asset_type: asset.type,
                    p_lng: asset.coords[1],
                    p_lat: asset.coords[0],
                    p_desc: `Tagging otomatis dari lapangan`
                });
                
                if (assetError) console.error('Gagal simpan aset:', assetError);
            }
        }

        return ctx.reply(`✅ DATA BERHASIL DISIMPAN!\n\nNama Rute: ${parsed.route_name}\nJumlah Titik Jalur: ${parsed.coordinates.length}\nJumlah Perangkat: ${parsed.assets.length}\n\nData sudah masuk ke database Supabase dan langsung tampil di Dashboard.`);

    } catch (err) {
        console.error('Error proses Web App data:', err);
        return ctx.reply('❌ Gagal memproses dan menyimpan data survey lapangan. Periksa log server.');
    }
});

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            return res.status(200).json({ status: 'ok' });
        } catch (err) {
            console.error(err);
            return res.status(500).send('Error');
        }
    } else {
        return res.status(200).send('Bot berjalan...');
    }
};

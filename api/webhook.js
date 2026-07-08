const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Validasi Environment Variables
if (!process.env.TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN is missing');
if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is missing');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Perintah /start
bot.start((ctx) => {
    return ctx.reply('Halo Mas ! Silakan klik tombol "Buka Peta" di pojok kiri bawah untuk memulai survey rute kabel Surge, atau gunakan perintah /trace [nama_kabel] [jarak] untuk mencari lokasi gangguan.');
});

// 2. Perintah /trace (Pencari Jarak Gangguan)
bot.command('trace', async (ctx) => {
    console.log('Menerima perintah trace:', ctx.message.text);
    try {
        const text = ctx.message.text;
        const args = text.split(' ');

        if (args.length < 3) {
            return ctx.reply('⚠️ Format salah.\n\nGunakan format: `/trace [nama_kabel] [jarak_meter]`\nContoh: `/trace Surge 500`', { parse_mode: 'Markdown' });
        }

        const namaKabel = args[1];
        const jarakCari = parseFloat(args[2]);

        if (isNaN(jarakCari)) {
            return ctx.reply('⚠️ Jarak harus berupa angka. Contoh: 500');
        }

        // Jalankan query RPC ke Supabase
        const { data, error } = await supabase.rpc('trace_cable_location', {
            p_cable_name: namaKabel,
            p_distance: jarakCari
        });

        if (error) {
            console.error('Supabase RPC Error:', error);
            return ctx.reply(`❌ Database Error: ${error.message}`);
        }

        if (!data || data.length === 0) {
            return ctx.reply(`❌ Rute kabel dengan nama "${namaKabel}" tidak ditemukan atau tidak memiliki koordinat.`);
        }

        const result = data[0];
        
        let responseMsg = `📍 *HASIL TRACE GANGGUAN (${jarakCari} M)*\n\n`;
        responseMsg += `• *Rute:* ${result.route_name}\n`;
        responseMsg += `• *Koordinat Target:* \`${result.target_lat}, ${result.target_lng}\`\n\n`;
        
        if (result.nearest_asset_type) {
            responseMsg += `🔍 *Aset Terdekat di Lokasi:*\n`;
            responseMsg += `• *Jenis:* ${result.nearest_asset_type}\n`;
            responseMsg += `• *Jarak dari Titik Ukur:* ${Math.round(result.asset_distance_meters)} meter\n`;
            responseMsg += `• *Info:* ${result.asset_desc || '-'}\n`;
        } else {
            responseMsg += `🔍 *Aset Terdekat:* Tidak ada perangkat terdaftar dalam radius 50 meter di sekitar lokasi ini.\n`;
        }

        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${result.target_lat},${result.target_lng}`;
        
        return ctx.reply(responseMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '🗺️ Buka di Google Maps', url: mapsUrl }]]
            }
        });

    } catch (err) {
        console.error('Error runtime pada command trace:', err);
        return ctx.reply('❌ Terjadi kesalahan internal pada server bot.');
    }
});

// 3. Penangkap Data dari Web App Peta
bot.on('web_app_data', async (ctx) => {
    try {
        const rawData = ctx.message.web_app_data.data;
        const parsed = JSON.parse(rawData);

        const formattedCoords = parsed.coordinates.map(coord => `${coord[1]} ${coord[0]}`).join(', ');
        const lineStringWKT = `LINESTRING(${formattedCoords})`;

        const { data: routeData, error: routeError } = await supabase
            .from('routes')
            .insert([{ name: parsed.route_name, geom: lineStringWKT }])
            .select()
            .single();

        if (routeError) throw routeError;

        const routeId = routeData.id;

        if (parsed.assets && parsed.assets.length > 0) {
            for (const asset of parsed.assets) {
                await supabase.rpc('insert_asset_with_distance', {
                    p_route_id: routeId,
                    p_asset_type: asset.type,
                    p_lng: asset.coords[1],
                    p_lat: asset.coords[0],
                    p_desc: `Tagging otomatis lapangan`
                });
            }
        }

        return ctx.reply(`✅ DATA BERHASIL DISIMPAN!\n\nNama Rute: ${parsed.route_name}\nJumlah Titik Jalur: ${parsed.coordinates.length}\nJumlah Perangkat: ${parsed.assets.length}`);

    } catch (err) {
        console.error('Error proses Web App data:', err);
        return ctx.reply('❌ Gagal memproses data survey lapangan.');
    }
});

// Webhook handler untuk Vercel
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            return res.status(200).json({ status: 'ok' });
        } catch (err) {
            console.error('Global Webhook Error:', err);
            return res.status(500).send('Error');
        }
    } else {
        return res.status(200).send('Bot berjalan normal.');
    }
};

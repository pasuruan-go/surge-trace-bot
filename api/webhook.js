const { Telegraf } = require('telegraf');

if (!process.env.TELEGRAM_TOKEN) {
    throw new Error('TELEGRAM_TOKEN env variable is missing');
}

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Sediakan fungsi dummy agar vercel tidak timeout saat function di-warmup
bot.start((ctx) => {
    return ctx.reply('Halo Mas Ecky! Bot Surge Trace siap dikonfigurasi.');
});

bot.on('text', (ctx) => {
    return ctx.reply(`Anda mengirim: ${ctx.message.text}`);
});

module.exports = async (req, res) => {
    // Pastikan hanya menerima request POST dari Telegram
    if (req.method === 'POST') {
        try {
            // Jalankan handleUpdate secara langsung tanpa menunggu callback lama
            await bot.handleUpdate(req.body);
            return res.status(200).json({ status: 'ok' });
        } catch (err) {
            console.error('Telegraf error:', err);
            return res.status(500).send('Bot Error');
        }
    } else {
        return res.status(200).send('Bot sedang berjalan dan siap menerima webhook.');
    }
};

const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Handle perintah /start dasar
bot.start((ctx) => ctx.reply('Halo Mas Ecky! Bot Surge Trace siap dikonfigurasi.'));

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot sedang berjalan...');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error internal bot');
    }
};

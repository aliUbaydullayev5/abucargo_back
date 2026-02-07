const { Telegraf, Markup } = require('telegraf');
const { pool } = require('./db');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Получаем список разрешенных юзернеймов из .env и приводим к нижнему регистру
const allowedUsernames = (process.env.ALLOWED_USERNAMES || '')
    .split(',')
    .map(u => u.trim().replace('@', '').replace('https://t.me/', '').toLowerCase())
    .filter(u => u.length > 0);

console.log('Разрешенные юзернеймы:', allowedUsernames);

// Функция для добавления/обновления пользователя в БД
const upsertBotUser = async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username ? ctx.from.username.toLowerCase() : null;

    if (!username) {
        return ctx.reply('У вас не установлен username в Telegram. Пожалуйста, установите его в настройках.');
    }

    if (allowedUsernames.includes(username)) {
        try {
            await pool.query(
                `INSERT INTO bot_users (telegram_id, username) 
                 VALUES ($1, $2) 
                 ON CONFLICT (telegram_id) DO UPDATE SET username = $2`,
                [userId, username]
            );
            return true;
        } catch (err) {
            console.error('Ошибка при сохранении пользователя бота:', err);
            return false;
        }
    } else {
        return false;
    }
};

bot.start(async (ctx) => {
    const isAuthorized = await upsertBotUser(ctx);
    if (isAuthorized) {
        ctx.reply(
            'Добро пожаловать! Вы авторизованы.',
            Markup.keyboard([
                ['� Список лидов (текст)'],
                ['📂 Скачать Excel (.csv)']
            ]).resize()
        );
    } else {
        ctx.reply('Доступ запрещен. Ваш username не найден в списке разрешенных.');
        console.log(`Попытка доступа: ${ctx.from.username} (ID: ${ctx.from.id})`);
    }
});

// Проверка прав для остальных команд
const authMiddleware = async (ctx, next) => {
    const userId = ctx.from.id;
    const username = ctx.from.username ? ctx.from.username.toLowerCase() : '';

    if (allowedUsernames.includes(username)) {
        return next();
    } else {
        if (ctx.message && ctx.message.text !== '/start') {
            ctx.reply('У вас нет доступа.');
        }
    }
};

bot.use(authMiddleware);

// --- Функции отправки ---

// 1. Отправка CSV
const sendLeadsCSV = async (ctx) => {
    try {
        const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
        if (result.rows.length === 0) {
            return ctx.reply('Лидов пока нет.');
        }

        const header = 'ID,Name,Email,Phone,Date\n';
        const csvContent = header + result.rows.map(lead =>
            `${lead.id},"${lead.name}","${lead.email}","${lead.phone || ''}","${lead.created_at.toISOString()}"`
        ).join('\n');

        await ctx.replyWithDocument({
            source: Buffer.from(csvContent, 'utf-8'),
            filename: `leads_${new Date().toISOString().split('T')[0]}.csv`
        });

    } catch (err) {
        console.error('Ошибка при получении лидов (CSV):', err);
        ctx.reply('Ошибка при формировании файла.');
    }
};

// 2. Отправка Текста
const sendLeadsText = async (ctx) => {
    try {
        // Берем последние 10 записей
        const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 10');
        if (result.rows.length === 0) {
            return ctx.reply('Лидов пока нет.');
        }

        let message = '📋 **Последние 10 лидов:**\n\n';
        result.rows.forEach(lead => {
            // Форматируем дату красиво
            const date = new Date(lead.created_at).toLocaleString('ru-RU', { timeZone: 'UTC' });
            message += `🆔 ${lead.id}\n👤 ${lead.name}\n📧 ${lead.email}\n📱 ${lead.phone || 'Нет'}\n📅 ${date}\n-------------------\n`;
        });

        ctx.reply(message);
    } catch (err) {
        console.error('Ошибка при получении лидов (Текст):', err);
        ctx.reply('Ошибка при получении данных.');
    }
};

// --- Обработчики ---

// Обработка кнопки CSV (Regex для гибкости)
bot.hears(/Excel|csv/i, async (ctx) => {
    await sendLeadsCSV(ctx);
});

// Обработка кнопки Текст (Regex для гибкости)
bot.hears(/Список лидов|текст/i, async (ctx) => {
    await sendLeadsText(ctx);
});

// Старая команда /leads (пусть шлет CSV по умолчанию)
bot.command('leads', async (ctx) => {
    await sendLeadsCSV(ctx);
});

// Функция для уведомления о новом лиде
const notifyNewLead = async (lead) => {
    const message = `🚀 НОВЫЙ ЛИД!\n\nИмя: ${lead.name}\nEmail: ${lead.email}\nТелефон: ${lead.phone}\n\nПроверьте базу данных или используйте кнопки меню.`;

    try {
        const res = await pool.query('SELECT telegram_id FROM bot_users');
        const users = res.rows;

        if (users.length === 0) {
            console.log('Нет авторизованных пользователей для отправки уведомления.');
            return;
        }

        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.telegram_id, message);
            } catch (err) {
                console.error(`Не удалось отправить сообщение пользователю ${user.telegram_id}:`, err);
            }
        }
    } catch (err) {
        console.error('Ошибка при получении списка пользователей бота:', err);
    }
};

// Запуск
bot.launch().then(() => {
    console.log('Бот запущен');
}).catch(err => console.error('Ошибка запуска бота', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = {
    notifyNewLead
};

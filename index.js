const express = require('express');
const cors = require('cors');
const { pool, initDb } = require('./db');
const { notifyNewLead } = require('./bot');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Маршрут для приема лидов
app.post('/api/leads', async (req, res) => {
    if (!req.body) {
        return res.status(400).json({ error: 'Тело запроса отсутствует' });
    }

    console.log('Входящий запрос от Тильды:', JSON.stringify(req.body));

    // Tilda sends {"test":"test"} to verify the webhook — just return 200
    if (req.body.test) {
        return res.status(200).json({ status: 'ok' });
    }

    // Tilda sends fields with capital letters: Name, Email, Phone
    const name = req.body.name || req.body.Name || req.body.NAME;
    const email = req.body.email || req.body.Email || req.body.EMAIL;
    const phone = req.body.phone || req.body.Phone || req.body.PHONE;

    if (!name || !email || !phone) {
        console.error('Не хватает полей. Получено:', JSON.stringify(req.body));
        return res.status(400).json({ error: 'Все поля (name, email, phone) обязательны' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO leads (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
            [name, email, phone]
        );

        const newLead = result.rows[0];
        console.log('Новый лид сохранен:', newLead.id);

        // Уведомление в Telegram
        // Мы не ждем завершения отправки, чтобы быстрее ответить клиенту, 
        // но логируем ошибки внутри notifyNewLead
        notifyNewLead(newLead);

        res.status(201).json({ message: 'Лид успешно сохранен', leadId: newLead.id });
    } catch (err) {
        console.error('Ошибка при сохранении лида:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Инициализация базы данных при старте и запуск сервера
console.log('Подключение к базе данных...');
initDb()
    .then(() => {
        // Запускаем сервер только после успешного подключения к БД
        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
            console.log('Таблицы базы данных проверены и готовы к работе.');
        });
    })
    .catch((err) => {
        console.error('КРИТИЧЕСКАЯ ОШИБКА: Не удалось инициализировать БД. Сервер не запущен.', err);
        process.exit(1);
    });

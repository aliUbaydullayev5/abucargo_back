const express = require('express');
const cors = require('cors');
const { pool, initDb } = require('./db');
const { notifyNewLead } = require('./bot');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Инициализация базы данных при старте и запуск сервера
console.log('Попытка запуска сервера...');
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Сервер запущен на порту ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Не удалось инициализировать БД. Сервер не запущен.', err);
        process.exit(1);
    });

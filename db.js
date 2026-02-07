const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Асинхронная инициализация таблиц
const initDb = async () => {
  try {
    // Таблица лидов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Миграция: приводим базу в порядок
    console.log('Запуск миграции базы данных...');
    try {
      // Сначала делаем колонку nullable, чтобы не было ошибок, если она есть
      await pool.query('ALTER TABLE leads ALTER COLUMN password DROP NOT NULL').catch(() => { });
      await pool.query('ALTER TABLE leads DROP COLUMN IF EXISTS password');
      await pool.query('ALTER TABLE leads DROP COLUMN IF EXISTS phone_number');
      await pool.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone VARCHAR(255)');
      console.log('Миграция успешно выполнена: password удален, phone добавлен.');
    } catch (migrationErr) {
      console.error('Ошибка во время миграции:', migrationErr);
    }

    // Таблица пользователей бота (для хранения chat_id по username)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_users (
        telegram_id BIGINT PRIMARY KEY,
        username VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('База данных инициализирована.');
  } catch (err) {
    console.error('Ошибка при инициализации базы данных:', err);
    throw err; // Re-throw the error so index.js can handle it
  }
};

module.exports = {
  pool,
  initDb,
};

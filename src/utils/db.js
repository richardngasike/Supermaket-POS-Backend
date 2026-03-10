const { Pool } = require('pg');
require('dotenv').config(); // Ensure .env is loaded

// Helper to get env vars and trim whitespace
const getEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is not set`);
  return value.trim();
};

const pool = new Pool({
  host: getEnv('DB_HOST'),
  port: parseInt(getEnv('DB_PORT')),
  database: getEnv('DB_NAME'),
  user: getEnv('DB_USER'),
  password: getEnv('DB_PASSWORD'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
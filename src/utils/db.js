// Above source code is for local host

// const { Pool } = require('pg');
// require('dotenv').config(); // Ensure .env is loaded

// // Helper to get env vars and trim whitespace
// const getEnv = (key) => {
//   const value = process.env[key];
//   if (!value) throw new Error(`Environment variable ${key} is not set`);
//   return value.trim();
// };

// const pool = new Pool({
//   host: getEnv('DB_HOST'),
//   port: parseInt(getEnv('DB_PORT')),
//   database: getEnv('DB_NAME'),
//   user: getEnv('DB_USER'),
//   password: getEnv('DB_PASSWORD'),
//   max: 20,
//   idleTimeoutMillis: 30000,
//   connectionTimeoutMillis: 2000,
// });

// pool.on('error', (err) => {
//   console.error('Unexpected error on idle client', err);
// });

// module.exports = pool;

// above source code is for production on render

const { Pool } = require('pg');
require('dotenv').config(); // Load environment variables

// Helper function to safely read env variables
const getEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable ${key} is not set`);
  return value.trim();
};

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: getEnv('DATABASE_URL'),
  ssl: {
    rejectUnauthorized: false, // Required for Render PostgreSQL
  },
  max: 20, // Maximum clients in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle unexpected errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Optional: test connection when server starts
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
  }
};

testConnection();

module.exports = pool;
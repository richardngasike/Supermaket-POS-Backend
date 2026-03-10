const bcrypt = require('bcryptjs');
const pool = require('./utils/db');

async function createDemoUsers() {
  try {
    // Demo users
    const users = [
      {
        username: 'admin',
        full_name: 'Admin User',
        email: 'admin@example.com',
        password: 'Admin@2026',
        role: 'admin',
        phone: '0712345678',
      },
      {
        username: 'cashier1',
        full_name: 'Cashier One',
        email: 'cashier1@example.com',
        password: 'Cashier@2026',
        role: 'cashier',
        phone: '0722345678',
      },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await pool.query(
        `INSERT INTO users 
          (username, full_name, email, password_hash, role, is_active, phone, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (username) DO NOTHING`,
        [u.username.toLowerCase(), u.full_name, u.email, hash, u.role, true, u.phone]
      );
      console.log(`Created user: ${u.username}`);
    }

    console.log('✅ Demo users created successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error creating users:', err);
    process.exit(1);
  }
}

createDemoUsers();
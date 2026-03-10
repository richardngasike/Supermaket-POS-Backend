require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'supermarket_pos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Seed categories
    const categories = [
      { name: 'Fresh Produce', description: 'Fruits, vegetables & fresh items', color: '#27AE60' },
      { name: 'Dairy & Eggs', description: 'Milk, cheese, eggs & dairy products', color: '#3498DB' },
      { name: 'Beverages', description: 'Drinks, juices, sodas & water', color: '#E74C3C' },
      { name: 'Grains & Cereals', description: 'Rice, maize, wheat & cereals', color: '#F39C12' },
      { name: 'Meat & Poultry', description: 'Fresh & frozen meats', color: '#C0392B' },
      { name: 'Personal Care', description: 'Soap, toothpaste, shampoo', color: '#9B59B6' },
      { name: 'Household', description: 'Cleaning & household products', color: '#1ABC9C' },
      { name: 'Snacks & Confectionery', description: 'Biscuits, sweets & snacks', color: '#E67E22' },
      { name: 'Cooking Essentials', description: 'Oil, spices, condiments', color: '#D35400' },
      { name: 'Baby Products', description: 'Baby food, diapers & care', color: '#F1C40F' },
    ];

    const categoryIds = {};
    for (const cat of categories) {
      const res = await client.query(
        `INSERT INTO categories (name, description, color) VALUES ($1,$2,$3)
         ON CONFLICT (name) DO UPDATE SET description=$2, color=$3 RETURNING id`,
        [cat.name, cat.description, cat.color]
      );
      categoryIds[cat.name] = res.rows[0].id;
    }

    // Seed admin user
    const adminHash = await bcrypt.hash('Admin@2026', 10);
    const cashierHash = await bcrypt.hash('Cashier@2026', 10);
    const managerHash = await bcrypt.hash('Manager@2026', 10);

    await client.query(
      `INSERT INTO users (username, full_name, email, password_hash, role, phone)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`,
      ['admin', 'System Administrator', 'admin@supermarket.co.ke', adminHash, 'admin', '0700000001']
    );
    await client.query(
      `INSERT INTO users (username, full_name, email, password_hash, role, phone)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`,
      ['cashier1', 'Jane Wanjiku', 'jane.wanjiku@supermarket.co.ke', cashierHash, 'cashier', '0712345678']
    );
    await client.query(
      `INSERT INTO users (username, full_name, email, password_hash, role, phone)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING`,
      ['manager1', 'David Kamau', 'david.kamau@supermarket.co.ke', managerHash, 'manager', '0723456789']
    );

    // Seed products
    const products = [
      { name: 'Maziwa Safi Fresh Milk 1L', barcode: '6001255000001', cat: 'Dairy & Eggs', buy: 55, sell: 70, qty: 100, unit: 'litre', vat: 0 },
      { name: 'Brookside Milk 500ml', barcode: '6001255000002', cat: 'Dairy & Eggs', buy: 30, sell: 40, qty: 150, unit: 'piece', vat: 0 },
      { name: 'Large Eggs Tray (30)', barcode: '6001255000003', cat: 'Dairy & Eggs', buy: 380, sell: 450, qty: 50, unit: 'tray', vat: 0 },
      { name: 'Pembe Maize Flour 2kg', barcode: '6001255000004', cat: 'Grains & Cereals', buy: 110, sell: 140, qty: 200, unit: 'kg', vat: 0 },
      { name: 'Jogoo Maize Flour 2kg', barcode: '6001255000005', cat: 'Grains & Cereals', buy: 105, sell: 135, qty: 180, unit: 'kg', vat: 0 },
      { name: 'Basmati Rice 2kg', barcode: '6001255000006', cat: 'Grains & Cereals', buy: 220, sell: 280, qty: 120, unit: 'kg', vat: 16 },
      { name: 'Weetabix 430g', barcode: '6001255000007', cat: 'Grains & Cereals', buy: 270, sell: 330, qty: 80, unit: 'piece', vat: 16 },
      { name: 'Tusker Lager 500ml', barcode: '6001255000008', cat: 'Beverages', buy: 200, sell: 250, qty: 300, unit: 'bottle', vat: 16 },
      { name: 'Coca-Cola 500ml', barcode: '6001255000009', cat: 'Beverages', buy: 55, sell: 70, qty: 400, unit: 'bottle', vat: 16 },
      { name: 'Dasani Water 500ml', barcode: '6001255000010', cat: 'Beverages', buy: 25, sell: 40, qty: 500, unit: 'bottle', vat: 16 },
      { name: 'Minute Maid Orange 300ml', barcode: '6001255000011', cat: 'Beverages', buy: 45, sell: 60, qty: 250, unit: 'bottle', vat: 16 },
      { name: 'Royco Mchuzi Mix 75g', barcode: '6001255000012', cat: 'Cooking Essentials', buy: 25, sell: 35, qty: 300, unit: 'piece', vat: 16 },
      { name: 'Rina Cooking Oil 2L', barcode: '6001255000013', cat: 'Cooking Essentials', buy: 280, sell: 340, qty: 90, unit: 'litre', vat: 0 },
      { name: 'Tomatoes (1kg)', barcode: '6001255000014', cat: 'Fresh Produce', buy: 80, sell: 120, qty: 60, unit: 'kg', vat: 0 },
      { name: 'Onions (1kg)', barcode: '6001255000015', cat: 'Fresh Produce', buy: 60, sell: 100, qty: 80, unit: 'kg', vat: 0 },
      { name: 'Chicken Breast 500g', barcode: '6001255000016', cat: 'Meat & Poultry', buy: 250, sell: 320, qty: 40, unit: 'piece', vat: 0 },
      { name: 'Minced Beef 500g', barcode: '6001255000017', cat: 'Meat & Poultry', buy: 280, sell: 360, qty: 35, unit: 'piece', vat: 0 },
      { name: 'Colgate Toothpaste 100ml', barcode: '6001255000018', cat: 'Personal Care', buy: 120, sell: 155, qty: 100, unit: 'piece', vat: 16 },
      { name: 'Dettol Soap 175g', barcode: '6001255000019', cat: 'Personal Care', buy: 65, sell: 85, qty: 150, unit: 'piece', vat: 16 },
      { name: 'Ariel Washing Powder 1kg', barcode: '6001255000020', cat: 'Household', buy: 280, sell: 340, qty: 75, unit: 'piece', vat: 16 },
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO products (name, barcode, category_id, buying_price, selling_price, quantity, unit, vat_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (barcode) DO NOTHING`,
        [p.name, p.barcode, categoryIds[p.cat], p.buy, p.sell, p.qty, p.unit, p.vat]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Database seeded successfully');
    console.log('\n📋 Default credentials:');
    console.log('  Admin    → username: admin     | password: Admin@2026');
    console.log('  Manager  → username: manager1  | password: Manager@2026');
    console.log('  Cashier  → username: cashier1  | password: Cashier@2026');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(console.error);

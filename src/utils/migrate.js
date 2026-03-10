require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'supermarket_pos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin','cashier','manager','supervisor')),
        is_active BOOLEAN DEFAULT true,
        phone VARCHAR(15),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        color VARCHAR(7) DEFAULT '#2ECC71',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        barcode VARCHAR(100) UNIQUE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        buying_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        selling_price DECIMAL(12,2) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        min_stock_level INTEGER DEFAULT 5,
        unit VARCHAR(30) DEFAULT 'piece',
        description TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        vat_rate DECIMAL(5,2) DEFAULT 16.00,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Sales/Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_number VARCHAR(50) UNIQUE NOT NULL,
        cashier_id UUID REFERENCES users(id),
        subtotal DECIMAL(12,2) NOT NULL,
        vat_amount DECIMAL(12,2) DEFAULT 0,
        discount_amount DECIMAL(12,2) DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash','mpesa','card')),
        amount_tendered DECIMAL(12,2),
        change_amount DECIMAL(12,2) DEFAULT 0,
        mpesa_ref VARCHAR(100),
        customer_phone VARCHAR(15),
        customer_name VARCHAR(100),
        card_ref VARCHAR(100),
        status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed','voided','pending')),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Sale items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id),
        product_name VARCHAR(200) NOT NULL,
        product_barcode VARCHAR(100),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        vat_rate DECIMAL(5,2) DEFAULT 16.00,
        vat_amount DECIMAL(12,2) DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // MPesa transactions tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_request_id VARCHAR(100) UNIQUE,
        merchant_request_id VARCHAR(100),
        sale_id UUID REFERENCES sales(id),
        phone_number VARCHAR(15) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        mpesa_receipt_number VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
        result_code VARCHAR(10),
        result_desc TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Stock movement / audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id),
        type VARCHAR(20) NOT NULL CHECK (type IN ('sale','restock','adjustment','return')),
        quantity_change INTEGER NOT NULL,
        quantity_before INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        reference_id UUID,
        note TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Activity logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id UUID,
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mpesa_checkout ON mpesa_transactions(checkout_request_id);`);

    await client.query('COMMIT');
    console.log('✅ Database migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

createTables().catch(console.error);

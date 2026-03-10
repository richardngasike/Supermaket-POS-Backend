const pool = require('../utils/db');

const getProducts = async (req, res) => {
  try {
    const { category, search, active, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT p.*, c.name as category_name, c.color as category_color
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (active !== undefined) { params.push(active === 'true'); query += ` AND p.is_active=$${params.length}`; }
    if (category) { params.push(category); query += ` AND p.category_id=$${params.length}`; }
    if (search) { params.push(`%${search}%`); query += ` AND (p.name ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`; }
    query += ` ORDER BY p.name ASC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    const countResult = await pool.query(`SELECT COUNT(*) FROM products p WHERE 1=1${active !== undefined ? ' AND p.is_active=$1' : ''}`, active !== undefined ? [active === 'true'] : []);
    res.json({ success: true, products: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getProductByBarcode = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.barcode=$1 AND p.is_active=true`,
      [req.params.barcode]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, barcode, category_id, buying_price, selling_price, quantity, min_stock_level, unit, description, vat_rate } = req.body;
    if (!name || !selling_price) return res.status(400).json({ success: false, message: 'Name and selling price required' });
    const result = await pool.query(
      `INSERT INTO products (name, barcode, category_id, buying_price, selling_price, quantity, min_stock_level, unit, description, vat_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, barcode || null, category_id || null, buying_price || 0, selling_price, quantity || 0, min_stock_level || 5, unit || 'piece', description || '', vat_rate || 16]
    );
    if (quantity > 0) {
      await pool.query(
        `INSERT INTO stock_movements (product_id, type, quantity_change, quantity_before, quantity_after, note, created_by)
         VALUES ($1,'restock',$2,0,$2,'Initial stock',  $3)`,
        [result.rows[0].id, quantity, req.user.id]
      );
    }
    res.status(201).json({ success: true, product: result.rows[0], message: 'Product created' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Barcode already exists' });
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, barcode, category_id, buying_price, selling_price, min_stock_level, unit, description, vat_rate, is_active } = req.body;
    const result = await pool.query(
      `UPDATE products SET name=COALESCE($1,name), barcode=COALESCE($2,barcode), category_id=COALESCE($3,category_id),
       buying_price=COALESCE($4,buying_price), selling_price=COALESCE($5,selling_price),
       min_stock_level=COALESCE($6,min_stock_level), unit=COALESCE($7,unit), description=COALESCE($8,description),
       vat_rate=COALESCE($9,vat_rate), is_active=COALESCE($10,is_active), updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [name, barcode, category_id, buying_price, selling_price, min_stock_level, unit, description, vat_rate, is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: result.rows[0], message: 'Product updated' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Barcode already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const restockProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, note } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ success: false, message: 'Valid quantity required' });
    const current = await pool.query('SELECT quantity FROM products WHERE id=$1', [id]);
    if (!current.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    const before = current.rows[0].quantity;
    const after = before + parseInt(quantity);
    await pool.query('UPDATE products SET quantity=$1, updated_at=NOW() WHERE id=$2', [after, id]);
    await pool.query(
      `INSERT INTO stock_movements (product_id, type, quantity_change, quantity_before, quantity_after, note, created_by)
       VALUES ($1,'restock',$2,$3,$4,$5,$6)`,
      [id, quantity, before, after, note || 'Stock restock', req.user.id]
    );
    res.json({ success: true, message: 'Stock updated', new_quantity: after });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getLowStock = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id
       WHERE p.quantity <= p.min_stock_level AND p.is_active=true ORDER BY p.quantity ASC`
    );
    res.json({ success: true, products: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getProducts, getProductByBarcode, createProduct, updateProduct, restockProduct, getLowStock };

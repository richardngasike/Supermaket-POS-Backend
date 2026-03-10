const pool = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

const generateReceiptNumber = () => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${dateStr}-${rand}`;
};

const createSale = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items, payment_method, amount_tendered, customer_phone, customer_name, card_ref, notes, discount_amount } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'No items in cart' });
    if (!payment_method) return res.status(400).json({ success: false, message: 'Payment method required' });

    let subtotal = 0;
    let vat_total = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await client.query('SELECT * FROM products WHERE id=$1 AND is_active=true FOR UPDATE', [item.product_id]);
      if (!product.rows.length) throw new Error(`Product not found: ${item.product_id}`);
      const p = product.rows[0];
      if (p.quantity < item.quantity) throw new Error(`Insufficient stock for ${p.name}. Available: ${p.quantity}`);
      const item_subtotal = parseFloat(p.selling_price) * item.quantity;
      const item_vat = p.vat_rate > 0 ? (item_subtotal * p.vat_rate / (100 + p.vat_rate)) : 0;
      subtotal += item_subtotal;
      vat_total += item_vat;
      processedItems.push({ ...p, quantity_ordered: item.quantity, item_subtotal, item_vat });
    }

    const disc = parseFloat(discount_amount) || 0;
    const total = subtotal - disc;
    const change = payment_method === 'cash' ? (parseFloat(amount_tendered) || 0) - total : 0;

    const receipt_number = generateReceiptNumber();
    const saleResult = await client.query(
      `INSERT INTO sales (receipt_number, cashier_id, subtotal, vat_amount, discount_amount, total_amount, payment_method, amount_tendered, change_amount, customer_phone, customer_name, card_ref, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [receipt_number, req.user.id, subtotal, vat_total, disc, total, payment_method, amount_tendered || total, change < 0 ? 0 : change, customer_phone || null, customer_name || null, card_ref || null, notes || null]
    );
    const sale = saleResult.rows[0];

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, product_barcode, quantity, unit_price, vat_rate, vat_amount, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sale.id, item.id, item.name, item.barcode, item.quantity_ordered, item.selling_price, item.vat_rate, item.item_vat, item.item_subtotal]
      );
      const new_qty = item.quantity - item.quantity_ordered;
      await client.query('UPDATE products SET quantity=$1, updated_at=NOW() WHERE id=$2', [new_qty, item.id]);
      await client.query(
        `INSERT INTO stock_movements (product_id, type, quantity_change, quantity_before, quantity_after, reference_id, note, created_by)
         VALUES ($1,'sale',$2,$3,$4,$5,'Sale transaction',$6)`,
        [item.id, -item.quantity_ordered, item.quantity, new_qty, sale.id, req.user.id]
      );
    }

    await client.query('COMMIT');

    const fullSale = await pool.query(
      `SELECT s.*, u.full_name as cashier_name,
       json_agg(json_build_object('id', si.id, 'product_name', si.product_name, 'product_barcode', si.product_barcode,
         'quantity', si.quantity, 'unit_price', si.unit_price, 'vat_rate', si.vat_rate, 'vat_amount', si.vat_amount, 'subtotal', si.subtotal)) as items
       FROM sales s LEFT JOIN users u ON s.cashier_id=u.id LEFT JOIN sale_items si ON s.id=si.sale_id
       WHERE s.id=$1 GROUP BY s.id, u.full_name`,
      [sale.id]
    );

    res.status(201).json({ success: true, sale: fullSale.rows[0], message: 'Sale completed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sale error:', err);
    res.status(400).json({ success: false, message: err.message || 'Sale failed' });
  } finally {
    client.release();
  }
};

const getSales = async (req, res) => {
  try {
    const { start_date, end_date, cashier_id, payment_method, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT s.*, u.full_name as cashier_name FROM sales s LEFT JOIN users u ON s.cashier_id=u.id WHERE 1=1`;
    const params = [];
    if (start_date) { params.push(start_date); query += ` AND s.created_at >= $${params.length}`; }
    if (end_date) { params.push(end_date + ' 23:59:59'); query += ` AND s.created_at <= $${params.length}`; }
    if (cashier_id) { params.push(cashier_id); query += ` AND s.cashier_id=$${params.length}`; }
    if (payment_method) { params.push(payment_method); query += ` AND s.payment_method=$${params.length}`; }
    query += ` ORDER BY s.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ success: true, sales: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSaleById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name as cashier_name,
       json_agg(json_build_object('id', si.id, 'product_name', si.product_name, 'product_barcode', si.product_barcode,
         'quantity', si.quantity, 'unit_price', si.unit_price, 'vat_rate', si.vat_rate, 'vat_amount', si.vat_amount, 'subtotal', si.subtotal)) as items
       FROM sales s LEFT JOIN users u ON s.cashier_id=u.id LEFT JOIN sale_items si ON s.id=si.sale_id
       WHERE s.id=$1 OR s.receipt_number=$1 GROUP BY s.id, u.full_name`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Sale not found' });
    res.json({ success: true, sale: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getDailySummary = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(total_amount) as total_revenue,
        SUM(vat_amount) as total_vat,
        SUM(discount_amount) as total_discounts,
        SUM(CASE WHEN payment_method='cash' THEN total_amount ELSE 0 END) as cash_total,
        SUM(CASE WHEN payment_method='mpesa' THEN total_amount ELSE 0 END) as mpesa_total,
        SUM(CASE WHEN payment_method='card' THEN total_amount ELSE 0 END) as card_total,
        COUNT(CASE WHEN payment_method='cash' THEN 1 END) as cash_count,
        COUNT(CASE WHEN payment_method='mpesa' THEN 1 END) as mpesa_count,
        COUNT(CASE WHEN payment_method='card' THEN 1 END) as card_count
       FROM sales
       WHERE DATE(created_at)=$1 AND status='completed'`,
      [targetDate]
    );
    const topProducts = await pool.query(
      `SELECT si.product_name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_revenue
       FROM sale_items si JOIN sales s ON si.sale_id=s.id
       WHERE DATE(s.created_at)=$1 AND s.status='completed'
       GROUP BY si.product_name ORDER BY total_revenue DESC LIMIT 10`,
      [targetDate]
    );
    res.json({ success: true, summary: result.rows[0], top_products: topProducts.rows, date: targetDate });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const voidSale = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sale = await client.query('SELECT * FROM sales WHERE id=$1', [req.params.id]);
    if (!sale.rows.length) return res.status(404).json({ success: false, message: 'Sale not found' });
    if (sale.rows[0].status === 'voided') return res.status(400).json({ success: false, message: 'Sale already voided' });
    await client.query('UPDATE sales SET status=$1 WHERE id=$2', ['voided', req.params.id]);
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [req.params.id]);
    for (const item of items.rows) {
      const current = await client.query('SELECT quantity FROM products WHERE id=$1', [item.product_id]);
      if (current.rows.length) {
        const before = current.rows[0].quantity;
        const after = before + item.quantity;
        await client.query('UPDATE products SET quantity=$1 WHERE id=$2', [after, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, type, quantity_change, quantity_before, quantity_after, reference_id, note, created_by)
           VALUES ($1,'return',$2,$3,$4,$5,'Sale voided',$6)`,
          [item.product_id, item.quantity, before, after, sale.rows[0].id, req.user.id]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Sale voided and stock restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { createSale, getSales, getSaleById, getDailySummary, voidSale };

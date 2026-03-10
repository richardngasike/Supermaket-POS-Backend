const pool = require('../utils/db');

const getCategories = async (req, res) => {
  try {
    const result = await pool.query(`SELECT c.*, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON c.id=p.category_id AND p.is_active=true GROUP BY c.id ORDER BY c.name`);
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createCategory = async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name required' });
    const result = await pool.query('INSERT INTO categories (name, description, color) VALUES ($1,$2,$3) RETURNING *', [name, description || '', color || '#2ECC71']);
    res.status(201).json({ success: true, category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Category already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;
    const result = await pool.query('UPDATE categories SET name=COALESCE($1,name), description=COALESCE($2,description), color=COALESCE($3,color) WHERE id=$4 RETURNING *', [name, description, color, id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getCategories, createCategory, updateCategory };

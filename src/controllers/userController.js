const bcrypt = require('bcryptjs');
const pool = require('../utils/db');

const getUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, full_name, email, role, is_active, phone, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, full_name, email, password, role, phone } = req.body;
    if (!username || !full_name || !password || !role) {
      return res.status(400).json({ success: false, message: 'Username, full name, password and role required' });
    }
    const valid_roles = ['admin', 'cashier', 'manager', 'supervisor'];
    if (!valid_roles.includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, full_name, email, password_hash, role, phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, full_name, email, role, phone, is_active, created_at`,
      [username.toLowerCase().trim(), full_name, email || null, hash, role, phone || null]
    );
    res.status(201).json({ success: true, user: result.rows[0], message: 'User created' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: 'Username or email already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, role, phone, is_active } = req.body;
    const result = await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name), email=COALESCE($2,email), role=COALESCE($3,role),
       phone=COALESCE($4,phone), is_active=COALESCE($5,is_active), updated_at=NOW()
       WHERE id=$6 RETURNING id, username, full_name, email, role, phone, is_active`,
      [full_name, email, role, phone, is_active, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: result.rows[0], message: 'User updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, id]);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { getUsers, createUser, updateUser, resetUserPassword };

const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// GET /api/stores  -> all approved stores
router.get('/stores', (req, res) => {
  const stores = db
    .prepare("SELECT id, name, location FROM stores WHERE status = 'approved' ORDER BY name")
    .all();
  res.json({ stores });
});

// GET /api/stores/:id/products?search=pen&category=Pens
router.get('/stores/:id/products', (req, res) => {
  const storeId = Number(req.params.id);

  const store = db
    .prepare("SELECT id, name, location FROM stores WHERE id = ? AND status = 'approved'")
    .get(storeId);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const search = (req.query.search || '').trim();
  const category = (req.query.category || '').trim();

  // Build the query piece by piece; the ? placeholders keep user input safe
  let sql = 'SELECT id, name, category, price, stock FROM products WHERE store_id = ?';
  const params = [storeId];
  if (search) {
    sql += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY name';

  const products = db.prepare(sql).all(...params);
  const categories = db
    .prepare('SELECT DISTINCT category FROM products WHERE store_id = ? ORDER BY category')
    .all(storeId)
    .map((r) => r.category);

  res.json({ store, products, categories });
});

module.exports = router;
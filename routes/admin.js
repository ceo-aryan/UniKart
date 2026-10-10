const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Every route in this file is for admins only
router.use(requireRole('admin'));

const count = (sql) => db.prepare(sql).get().c;

// ---------- Overview ----------
router.get('/stats', (req, res) => {
  res.json({
    customers: count("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'"),
    deliveryStaff: count("SELECT COUNT(*) AS c FROM users WHERE role = 'delivery'"),
    approvedStores: count("SELECT COUNT(*) AS c FROM stores WHERE status = 'approved'"),
    pendingStores: count("SELECT COUNT(*) AS c FROM stores WHERE status = 'pending'"),
    totalOrders: count('SELECT COUNT(*) AS c FROM orders'),
    activeOrders: count("SELECT COUNT(*) AS c FROM orders WHERE status IN ('placed','accepted','ready','out_for_delivery')"),
    deliveredOrders: count("SELECT COUNT(*) AS c FROM orders WHERE status = 'delivered'"),
    revenue: db.prepare("SELECT COALESCE(SUM(total), 0) AS t FROM orders WHERE status = 'delivered'").get().t
  });
});

// ---------- Users ----------
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role FROM users ORDER BY role, name').all();
  res.json({ users });
});

// Create a storekeeper (with their store) or a delivery person
router.post('/users', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const role = req.body.role;
  const storeName = (req.body.storeName || '').trim();
  const storeLocation = (req.body.storeLocation || '').trim();

  if (!['storekeeper', 'delivery'].includes(role)) {
    return res.status(400).json({ error: 'Role must be storekeeper or delivery' });
  }
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  }
  if (role === 'storekeeper' && (!storeName || !storeLocation)) {
    return res.status(400).json({ error: 'Store name and store location are required for a storekeeper' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'This email is already registered' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.transaction(() => {
    const userId = db
      .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hash, role).lastInsertRowid;
    if (role === 'storekeeper') {
      db.prepare("INSERT INTO stores (name, location, owner_id, status) VALUES (?, ?, ?, 'approved')")
        .run(storeName, storeLocation, userId);
    }
  })();

  res.status(201).json({ message: 'Account created' });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be deleted' });

  const used = db.prepare(`
    SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ? OR delivery_id = ?)
         + (SELECT COUNT(*) FROM stores WHERE owner_id = ?) AS n
  `).get(id, id, id).n;
  if (used > 0) {
    return res.status(409).json({
      error: 'This user has orders or owns a store, so the account cannot be deleted. Remove the store first.'
    });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ message: 'User deleted' });
});

// ---------- Stores ----------
router.get('/stores', (req, res) => {
  const stores = db.prepare(`
    SELECT s.id, s.name, s.location, s.status, u.name AS owner_name,
           (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS product_count,
           (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) AS order_count
    FROM stores s JOIN users u ON u.id = s.owner_id
    ORDER BY s.id
  `).all();
  res.json({ stores });
});

router.post('/stores/:id/status', (req, res) => {
  const status = req.body.status;
  if (!['approved', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = db.prepare('UPDATE stores SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Store not found' });
  res.json({ message: 'Store updated' });
});

router.delete('/stores/:id', (req, res) => {
  const id = Number(req.params.id);
  const store = db.prepare('SELECT id FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  if (count(`SELECT COUNT(*) AS c FROM orders WHERE store_id = ${id}`) > 0) {
    return res.status(409).json({ error: 'This store has order history. Suspend it instead of deleting it.' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM products WHERE store_id = ?').run(id);
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);
  })();
  res.json({ message: 'Store deleted' });
});

// ---------- Orders (monitoring) ----------
router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at,
           c.name AS customer_name, s.name AS store_name,
           l.name AS location_name, d.name AS delivery_name
    FROM orders o
    JOIN users c ON c.id = o.user_id
    JOIN stores s ON s.id = o.store_id
    JOIN locations l ON l.id = o.location_id
    LEFT JOIN users d ON d.id = o.delivery_id
    ORDER BY o.id DESC
    LIMIT 200
  `).all();
  res.json({ orders });
});

// ---------- Delivery locations ----------
router.get('/locations', (req, res) => {
  res.json({ locations: db.prepare('SELECT id, name, type FROM locations ORDER BY type, name').all() });
});

router.post('/locations', (req, res) => {
  const name = (req.body.name || '').trim();
  const type = req.body.type;
  if (!name || !['classroom', 'department', 'hostel', 'other'].includes(type)) {
    return res.status(400).json({ error: 'Enter a name and choose a type' });
  }
  db.prepare('INSERT INTO locations (name, type) VALUES (?, ?)').run(name, type);
  res.status(201).json({ message: 'Location added' });
});

router.delete('/locations/:id', (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE location_id = ?').get(id).c;
  if (used > 0) {
    return res.status(409).json({ error: 'This location is used by existing orders and cannot be deleted' });
  }
  const result = db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found' });
  res.json({ message: 'Location deleted' });
});

module.exports = router;
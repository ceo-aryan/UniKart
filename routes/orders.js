const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/locations -> predefined campus delivery spots
router.get('/locations', requireRole('customer'), (req, res) => {
  const locations = db.prepare('SELECT id, name, type FROM locations ORDER BY type, name').all();
  res.json({ locations });
});

// POST /api/orders  body: { storeId, locationId, items: [{ productId, qty }] }
router.post('/orders', requireRole('customer'), (req, res) => {
  const { storeId, locationId, items } = req.body;

  if (!storeId || !locationId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Store, location and at least one item are required' });
  }

  // Merge duplicate products and validate quantities
  const wanted = new Map();
  for (const it of items) {
    const productId = Number(it.productId);
    const qty = Number(it.qty);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty < 1 || qty > 100) {
      return res.status(400).json({ error: 'Invalid item in order' });
    }
    wanted.set(productId, (wanted.get(productId) || 0) + qty);
  }

  const store = db.prepare("SELECT id FROM stores WHERE id = ? AND status = 'approved'").get(storeId);
  if (!store) return res.status(400).json({ error: 'Store is not available' });

  const location = db.prepare('SELECT id FROM locations WHERE id = ?').get(locationId);
  if (!location) return res.status(400).json({ error: 'Please choose a valid delivery location' });

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?');
  const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
  const addOrder = db.prepare(
    'INSERT INTO orders (user_id, store_id, location_id, total) VALUES (?, ?, ?, ?)'
  );
  const addItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)'
  );

  // Everything inside this function succeeds together or fails together
  const placeOrder = db.transaction(() => {
    let total = 0;
    const lines = [];

    for (const [productId, qty] of wanted) {
      const product = getProduct.get(productId, store.id);
      if (!product) throw new Error('A product in your cart is no longer available');
      if (product.stock < qty) {
        throw new Error(`Not enough stock for "${product.name}" (only ${product.stock} left)`);
      }
      total += product.price * qty;
      lines.push({ product, qty });
    }

    const orderId = addOrder.run(req.session.user.id, store.id, location.id, total).lastInsertRowid;

    for (const { product, qty } of lines) {
      addItem.run(orderId, product.id, qty, product.price); // price at time of purchase
      reduceStock.run(qty, product.id);
    }
    return { orderId, total };
  });

  try {
    const result = placeOrder();
    res.status(201).json({ message: 'Order placed', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/orders/mine -> the logged-in customer's orders, newest first
router.get('/orders/mine', requireRole('customer'), (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at,
           s.name AS store_name, l.name AS location_name
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    JOIN locations l ON l.id = o.location_id
    WHERE o.user_id = ?
    ORDER BY o.id DESC
  `).all(req.session.user.id);

  const getItems = db.prepare(`
    SELECT p.name, oi.quantity, oi.price
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `);
  orders.forEach((o) => (o.items = getItems.all(o.id)));

  res.json({ orders });
});

module.exports = router;
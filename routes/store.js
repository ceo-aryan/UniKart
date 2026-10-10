const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Every route in this file is for storekeepers only
router.use(requireRole('storekeeper'));

// Find the store owned by the logged-in storekeeper
router.use((req, res, next) => {
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.session.user.id);
  if (!store) return res.status(404).json({ error: 'No store is linked to your account' });
  req.store = store;
  next();
});

// GET /api/store/me
router.get('/me', (req, res) => {
  const { id, name, location, status } = req.store;
  res.json({ store: { id, name, location, status } });
});

// ---------- Orders ----------

// GET /api/store/orders
router.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at,
           u.name AS customer_name, l.name AS location_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN locations l ON l.id = o.location_id
    WHERE o.store_id = ?
    ORDER BY o.id DESC
  `).all(req.store.id);

  const getItems = db.prepare(`
    SELECT p.name, oi.quantity, oi.price
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `);
  orders.forEach((o) => (o.items = getItems.all(o.id)));

  res.json({ orders });
});

// The only status changes a storekeeper is allowed to make
const ALLOWED = {
  placed: ['accepted', 'rejected'],
  accepted: ['ready']
};

// POST /api/store/orders/:id/status   body: { status }
router.post('/orders/:id/status', (req, res) => {
  const orderId = Number(req.params.id);
  const newStatus = req.body.status;

  // store_id check: a storekeeper can only touch their own store's orders
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?')
    .get(orderId, req.store.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!(ALLOWED[order.status] || []).includes(newStatus)) {
    return res.status(400).json({
      error: `Cannot change an order from "${order.status}" to "${newStatus}"`
    });
  }

  const update = db.transaction(() => {
    // "AND status = ?" makes sure nobody changed the order in the meantime
    const result = db
      .prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?')
      .run(newStatus, orderId, order.status);
    if (result.changes === 0) throw new Error('This order was already updated');

    // Rejected order: give the stock back
    if (newStatus === 'rejected') {
      const items = db
        .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
        .all(orderId);
      const restore = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      items.forEach((i) => restore.run(i.quantity, i.product_id));
    }
  });

  try {
    update();
    res.json({ message: 'Order updated', status: newStatus });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// ---------- Products ----------

// GET /api/store/products
router.get('/products', (req, res) => {
  const products = db
    .prepare('SELECT id, name, category, price, stock FROM products WHERE store_id = ? ORDER BY name')
    .all(req.store.id);
  res.json({ products });
});

// POST /api/store/products   body: { name, category, price, stock }
router.post('/products', (req, res) => {
  const name = (req.body.name || '').trim();
  const category = (req.body.category || '').trim();
  const price = Number(req.body.price);
  const stock = Number(req.body.stock);

  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required' });
  }
  if (!(price > 0) || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Enter a valid price and stock' });
  }

  db.prepare('INSERT INTO products (store_id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)')
    .run(req.store.id, name, category, price, stock);
  res.status(201).json({ message: 'Product added' });
});

// PUT /api/store/products/:id   body: { price, stock }
router.put('/products/:id', (req, res) => {
  const price = Number(req.body.price);
  const stock = Number(req.body.stock);

  if (!(price > 0) || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Enter a valid price and stock' });
  }

  const result = db
    .prepare('UPDATE products SET price = ?, stock = ? WHERE id = ? AND store_id = ?')
    .run(price, stock, Number(req.params.id), req.store.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });
  res.json({ message: 'Product updated' });
});

module.exports = router;
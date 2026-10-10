const express = require('express');
const db = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Every route in this file is for delivery staff only
router.use(requireRole('delivery'));

function withItems(orders) {
  const getItems = db.prepare(`
    SELECT p.name, oi.quantity
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `);
  orders.forEach((o) => (o.items = getItems.all(o.id)));
  return orders;
}

// GET /api/delivery/available -> ready orders nobody has picked up yet
router.get('/available', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.total, o.created_at,
           s.name AS store_name, s.location AS store_location,
           l.name AS location_name, u.name AS customer_name
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    JOIN locations l ON l.id = o.location_id
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'ready' AND o.delivery_id IS NULL
    ORDER BY o.id
  `).all();
  res.json({ orders: withItems(orders) });
});

// GET /api/delivery/mine -> orders assigned to me (active and finished)
router.get('/mine', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.total, o.status, o.created_at,
           s.name AS store_name, s.location AS store_location,
           l.name AS location_name, u.name AS customer_name
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    JOIN locations l ON l.id = o.location_id
    JOIN users u ON u.id = o.user_id
    WHERE o.delivery_id = ?
    ORDER BY o.id DESC
  `).all(req.session.user.id);
  res.json({ orders: withItems(orders) });
});

// POST /api/delivery/orders/:id/pickup -> claim an order
router.post('/orders/:id/pickup', (req, res) => {
  // This single UPDATE only succeeds if the order is still ready and unclaimed
  const result = db.prepare(`
    UPDATE orders
    SET status = 'out_for_delivery', delivery_id = ?
    WHERE id = ? AND status = 'ready' AND delivery_id IS NULL
  `).run(req.session.user.id, Number(req.params.id));

  if (result.changes === 0) {
    return res.status(409).json({ error: 'This order is no longer available' });
  }
  res.json({ message: 'Order picked up' });
});

// POST /api/delivery/orders/:id/deliver -> mark my order as delivered
router.post('/orders/:id/deliver', (req, res) => {
  const result = db.prepare(`
    UPDATE orders
    SET status = 'delivered'
    WHERE id = ? AND delivery_id = ? AND status = 'out_for_delivery'
  `).run(Number(req.params.id), req.session.user.id);

  if (result.changes === 0) {
    return res.status(400).json({ error: 'You cannot mark this order as delivered' });
  }
  res.json({ message: 'Order delivered' });
});

module.exports = router;
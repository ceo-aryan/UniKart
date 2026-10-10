const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// ---------- Simple brute-force protection ----------
// After 5 wrong passwords for the same email from the same device,
// block further attempts for 15 minutes. (Kept in memory: resets when the server restarts.)
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isBlocked(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const rec = attempts.get(key);
  if (!rec || Date.now() > rec.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    rec.count++;
  }
}

// POST /api/auth/register  (creates customers only)
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (String(name).trim().length < 2 || String(name).length > 60) {
    return res.status(400).json({ error: 'Please enter your full name' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (String(password).length < 6 || String(password).length > 100) {
    return res.status(400).json({ error: 'Password must be 6 to 100 characters' });
  }

  const cleanEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'This email is already registered' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name.trim(), cleanEmail, hash, 'customer');

  res.status(201).json({ message: 'Registration successful. You can log in now.' });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const key = `${req.ip}|${cleanEmail}`;

  if (isBlocked(key)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please try again in 15 minutes.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

  // Same message for both cases so attackers can't tell which emails exist
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  attempts.delete(key); // successful login clears the failures

  // Start a fresh session, then store only what we need (never the password)
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Login failed' });

    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.json({ user: req.session.user });
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// GET /api/auth/me  (who is logged in right now?)
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
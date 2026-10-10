const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn('WARNING: set the SESSION_SECRET environment variable before deploying!');
}

app.disable('x-powered-by');                 // don't advertise "Express" to attackers
app.use(express.json({ limit: '100kb' }));   // reject oversized request bodies

// Simple security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(session({
  name: 'unikart.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                // JavaScript in the page cannot read the cookie
    sameSite: 'lax',               // blocks most cross-site request attacks
    maxAge: 1000 * 60 * 60 * 8     // login lasts 8 hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ---------- API routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/stores'));
app.use('/api', require('./routes/orders'));
app.use('/api/store', require('./routes/store'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'UniKart server is running' });
});

// ---------- Error handling ----------
// Unknown API route -> JSON (never an HTML page, which confuses fetch)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Unknown page
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Any unexpected crash inside a route
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server' : 'Invalid request'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`UniKart running at http://localhost:${PORT}`);
});
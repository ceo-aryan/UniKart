// Blocks the request unless the user is logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  next();
}

// Blocks the request unless the user has one of the allowed roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please log in first' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to do this' });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
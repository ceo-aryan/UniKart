const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'unikart.db'));
db.pragma('foreign_keys = ON'); // enforce links between tables

// ---------- Create tables ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','storekeeper','delivery','admin'))
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved')),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('classroom','department','hostel','other'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed','accepted','rejected','ready','out_for_delivery','delivered')),
  delivery_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (delivery_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`);

// ---------- Demo data (only runs on a fresh database) ----------
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

if (userCount === 0) {
  const hash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'password123', 10);

  const addUser = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  );
  const addStore = db.prepare(
    'INSERT INTO stores (name, location, owner_id, status) VALUES (?, ?, ?, ?)'
  );
  const addProduct = db.prepare(
    'INSERT INTO products (store_id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)'
  );
  const addLocation = db.prepare('INSERT INTO locations (name, type) VALUES (?, ?)');

  const seed = db.transaction(() => {
    addUser.run('Admin', 'admin@unikart.com', hash, 'admin');
    addUser.run('Demo Student', 'student@unikart.com', hash, 'customer');
    addUser.run('Delivery Boy', 'delivery@unikart.com', hash, 'delivery');
    const shop1 = addUser.run('Stationery Owner', 'shop1@unikart.com', hash, 'storekeeper').lastInsertRowid;
    const shop2 = addUser.run('Print Shop Owner', 'shop2@unikart.com', hash, 'storekeeper').lastInsertRowid;

    const store1 = addStore.run('Campus Stationery', 'Near Main Gate', shop1, 'approved').lastInsertRowid;
    const store2 = addStore.run('Print & Copy Centre', 'Library Block', shop2, 'approved').lastInsertRowid;

    addProduct.run(store1, 'A4 Notebook (200 pages)', 'Notebooks', 60, 50);
    addProduct.run(store1, 'Blue Gel Pen (pack of 5)', 'Pens', 50, 80);
    addProduct.run(store1, 'Geometry Box', 'Stationery', 120, 20);
    addProduct.run(store1, 'Lab Record File', 'Files', 45, 40);
    addProduct.run(store2, 'Black & White Printout (per page)', 'Printing', 2, 500);
    addProduct.run(store2, 'Colour Printout (per page)', 'Printing', 10, 200);
    addProduct.run(store2, 'Spiral Binding', 'Printing', 40, 30);

    addLocation.run('CSE Department - Room 305', 'department');
    addLocation.run('CSE Department - Room 306', 'department');
    addLocation.run('Main Block - Classroom 101', 'classroom');
    addLocation.run('Main Block - Classroom 204', 'classroom');
    addLocation.run('Hostel A - Room 214', 'hostel');
    addLocation.run('Hostel B - Room 110', 'hostel');
    addLocation.run('Library Entrance', 'other');
  });

  seed();
  console.log('Database created with demo data');
}

console.log('Database ready');
module.exports = db;
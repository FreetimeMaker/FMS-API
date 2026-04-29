import Database from "better-sqlite3";
import { env } from "./env.js";

export function openDb() {
  const db = new Database(env.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('digital','donation','token','support')),
      currency TEXT NOT NULL DEFAULT 'USD',
      unit_amount INTEGER NOT NULL DEFAULT 0,
      purchase_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('created','pending_payment','paid','fulfilled','cancelled')),
      payment_provider TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      total_amount INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      fulfillment_code TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      UNIQUE(order_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fx_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(from_currency, to_currency)
    );
  `);

  // Erweiterungen (bilder + multi-währung) für bestehende DBs
  ensureColumn(db, "products", "image_urls", "TEXT"); // JSON-Array
  ensureColumn(db, "products", "prices_json", "TEXT"); // JSON-Objekt: { "USD": 1000, "EUR": 900 }
}

function ensureColumn(db, table, column, typeSql) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  } catch {
    // no-op: falls parallel/mehrfach ausgeführt
  }
}


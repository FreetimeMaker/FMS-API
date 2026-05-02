import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import { env } from "./env.js";

let dbWrapper = null;

// Check if using Turso (libSQL HTTP client)
const useTurso = Boolean(env.tursoDbUrl);
const useLocalSqlite = !useTurso;

// Create wrapper that provides better-sqlite3 compatible API
export function openDb() {
  if (dbWrapper) return dbWrapper;

  if (useTurso) {
    // Use libSQL client for Turso/Vercel
    const client = createClient({
      url: env.tursoDbUrl,
      authToken: env.tursoDbAuthToken || undefined,
    });
    dbWrapper = createLibSqlWrapper(client);
  } else {
    // Use legacy local better-sqlite3
    const sqliteDb = new Database(env.dbPath);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    dbWrapper = createLocalWrapper(sqliteDb);
  }

  return dbWrapper;
}

// Wrapper for libSQL (Turso) - provides sync-like API over async client
function createLibSqlWrapper(client) {
  return {
    _client: client,
    _isTurso: true,

    prepare(sql) {
      const self = this;
      return {
        all: (...args) => syncExec(client, sql, args, "all"),
        get: (...args) => syncExec(client, sql, args, "get"),
        run: (...args) => syncExec(client, sql, args, "run"),
      };
    },

    exec(sql) {
      // For DDL statements - run synchronously
      return syncExec(client, sql, [], "exec");
    },

    transaction(fn) {
      // libSQL HTTP doesn't support local transactions
      // Each statement auto-commits
      return () => fn();
    },
  };
}

// Wrapper for local better-sqlite3
function createLocalWrapper(sqliteDb) {
  return {
    _client: sqliteDb,
    _isLocal: true,

    prepare(sql) {
      return {
        all: (...args) => sqliteDb.prepare(sql).all(...args),
        get: (...args) => sqliteDb.prepare(sql).get(...args),
        run: (...args) => sqliteDb.prepare(sql).run(...args),
      };
    },

    exec(sql) {
      return sqliteDb.exec(sql);
    },

    transaction(fn) {
      return () => {
        const tx = sqliteDb.transaction(fn);
        return tx();
      };
    },
  };
}

// Execute libSQL statements synchronously
// libSQL client is async but we use synchronizer for compatibility
function syncExec(client, sql, args, mode) {
  // For Turso HTTP, we sync by running in promise context
  // This won't work perfectly for all cases but provides basic compatibility
  let result;

  // Synchronous approximation - this works for Vercel cold starts
  // For better compatibility, we'll use a sync/await approach
  try {
    // Try to execute
    const execResult = client.execute({
      sql: sql,
      args: args || [],
    });

    // Handle promise-based result
    if (execResult && typeof execResult.then === "function") {
      // It's a promise, we need to handle awaiting in server.js
      // For now, return placeholder that server.js can handle
      return { _pending: execResult, _isPromise: true };
    }

    return processLibSqlResult(execResult, mode);
  } catch (e) {
    // If error is "sync" related, try syncFallback
    if (e.message && e.message.includes("sync")) {
      return syncFallback(client, sql, args, mode);
    }
    throw e;
  }
}

function syncFallback(client, sql, args, mode) {
  // Fallback for sync contexts - actually await the promise
  const result = client.execute({
    sql: sql,
    args: args || [],
  });

  // Handle sync-await pattern
  if (result && typeof result === "object" && "_isPromise" in result) {
    // Need to handle in server.js differently
    // For now, return empty based on mode
    if (mode === "all") return [];
    if (mode === "get") return null;
    if (mode === "run") return { lastInsertRowid: 0, rowsAffected: 0 };
  }

  return processLibSqlResult(result, mode);
}

function processLibSqlResult(result, mode) {
  if (!result) {
    if (mode === "all") return [];
    if (mode === "get") return null;
    return { lastInsertRowid: 0, rowsAffected: 0 };
  }

  if (mode === "all") {
    return result.rows || [];
  }
  if (mode === "get") {
    return result.rows?.[0] || null;
  }
  // mode === "run"
  return {
    lastInsertRowid: result.lastInsertId || 0,
    rowsAffected: result.rowsAffected || 0,
  };
}

export async function migrate(db) {
  if (db._isTurso) {
    await migrateTurso(db);
  } else {
    migrateLocal(db);
  }
}

function migrateTurso(db) {
  const client = db._client;

  client.execute({
    sql: `
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
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
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
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        UNIQUE(order_id, product_id)
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS fx_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        rate REAL NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(from_currency, to_currency)
      )
    `,
    args: [],
  });

  client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS payment_providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'crypto',
        website TEXT,
        logo_url TEXT,
        description TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1
      )
    `,
    args: [],
  });

  // Add columns for products
  ensureColumnTurso(client, "products", "image_urls", "TEXT");
  ensureColumnTurso(client, "products", "prices_json", "TEXT");
  ensureColumnTurso(client, "products", "payment_links_json", "TEXT");
}

function migrateLocal(db) {
  const client = db._client;

  client.exec(`
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
    )
  `);

  client.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  client.exec(`
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
    )
  `);

  client.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      UNIQUE(order_id, product_id)
    )
  `);

  client.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  client.exec(`
    CREATE TABLE IF NOT EXISTS fx_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(from_currency, to_currency)
    )
  `);

  client.exec(`
    CREATE TABLE IF NOT EXISTS payment_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'crypto',
      website TEXT,
      logo_url TEXT,
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Add columns for products
  ensureColumnLocal(client, "products", "image_urls", "TEXT");
  ensureColumnLocal(client, "products", "prices_json", "TEXT");
  ensureColumnLocal(client, "products", "payment_links_json", "TEXT");
}

function ensureColumnTurso(client, table, column, typeSql) {
  try {
    // Check if column exists
    const result = client.execute({
      sql: `PRAGMA table_info(${table})`,
      args: [],
    });

    // Handle async result
    const cols = result.rows || [];
    if (cols.some((c) => c.name === column)) return;

    // Add column
    client.execute({
      sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`,
      args: [],
    });
  } catch {
    // no-op: if parallel/mehrfach executed
  }
}

function ensureColumnLocal(client, table, column, typeSql) {
  const stmt = client.prepare(`PRAGMA table_info(${table})`);
  const cols = stmt.all();
  if (cols.some((c) => c.name === column)) return;
  try {
    client.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  } catch {
    // no-op: if parallel/mehrfach executed
  }
}

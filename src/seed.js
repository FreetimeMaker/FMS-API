const nowIso = () => new Date().toISOString();

export function seedIfEmpty(db) {
  const row = db.prepare("SELECT id FROM products LIMIT 1").get();
  if (row) return;

  const insertProduct = db.prepare(`
    INSERT INTO products (sku, name, description, kind, currency, unit_amount, purchase_url, is_active)
    VALUES (@sku, @name, @description, @kind, @currency, @unit_amount, @purchase_url, @is_active)
  `);

  const products = [
    {
      sku: "first-background",
      name: "First Background",
      description: "Digital background (Code per E-Mail nach Kauf).",
      kind: "digital",
      currency: "USD",
      unit_amount: 1000,
      purchase_url: null,
      is_active: 1,
    },
    {
      sku: "donation",
      name: "Donation",
      description: "Unterstütze Freetime Maker mit einem freien Betrag (wird beim Checkout angegeben).",
      kind: "donation",
      currency: "USD",
      unit_amount: 0,
      purchase_url: null,
      is_active: 1,
    },
    {
      sku: "support",
      name: "Support",
      description: "Support-Anfrage (Ticket) – kein Produktversand, nur Kommunikation.",
      kind: "support",
      currency: "USD",
      unit_amount: 0,
      purchase_url: null,
      is_active: 1,
    },
    {
      sku: "token-freetime-maker-shop",
      name: "Freetime Maker Shop Token",
      description: "Token (externer Kauf-Link).",
      kind: "token",
      currency: "USD",
      unit_amount: 0,
      purchase_url: "https://pump.fun/",
      is_active: 1,
    },
  ];

  const tx = db.transaction(() => {
    for (const p of products) insertProduct.run(p);
    db.prepare(
      "INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)"
    ).run("Willkommen", "Das ist die erste News im Seed der FMS API.", nowIso());
  });
  tx();
}


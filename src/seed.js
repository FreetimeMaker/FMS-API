import fs from "node:fs";
import path from "node:path";

const nowIso = () => new Date().toISOString();

function loadJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeProduct(p) {
  const images = Array.isArray(p.images)
    ? p.images.map((u) => String(u).trim()).filter(Boolean)
    : [];

  const prices =
    p.prices && typeof p.prices === "object" && !Array.isArray(p.prices) ? p.prices : null;
  const normalizedPrices = prices
    ? Object.fromEntries(
        Object.entries(prices)
          .map(([k, v]) => [String(k).toUpperCase(), Number(v)])
          .filter(([k, v]) => k && Number.isFinite(v) && v >= 0)
      )
    : null;

  const currency = String(p.currency ?? "USD").toUpperCase();
  const unit_amount = Number(p.unit_amount ?? 0);
  const derivedPrices =
    normalizedPrices && Object.keys(normalizedPrices).length
      ? normalizedPrices
      : { [currency]: Number.isFinite(unit_amount) ? unit_amount : 0 };

  return {
    sku: String(p.sku ?? "").trim(),
    name: String(p.name ?? "").trim(),
    description: String(p.description ?? ""),
    kind: String(p.kind ?? "digital"),
    currency,
    unit_amount,
    purchase_url: p.purchase_url ?? null,
    is_active: p.is_active === false ? 0 : 1,
    image_urls: JSON.stringify(images),
    prices_json: JSON.stringify(derivedPrices),
  };
}

export function seedIfEmpty(db) {
  const hasProducts = db.prepare("SELECT id FROM products LIMIT 1").get() != null;

  // Wenn du echte Produkte pflegen willst: lege `data/products.json` an (siehe example).
  const productsFile = path.resolve(process.cwd(), "data", "products.json");
  const fileProducts = loadJsonIfExists(productsFile);

  const baseProducts = [
    {
      sku: "donation",
      name: "Donation",
      description: "Unterstütze Freetime Maker mit einem freien Betrag.",
      kind: "donation",
      currency: "USD",
      unit_amount: 0,
      purchase_url: null,
      is_active: 1,
    },
    {
      sku: "support",
      name: "Support",
      description: "Support-Anfrage (Ticket).",
      kind: "support",
      currency: "USD",
      unit_amount: 0,
      purchase_url: null,
      is_active: 1,
    },
  ];

  const products = Array.isArray(fileProducts)
    ? fileProducts.map(normalizeProduct)
    : baseProducts;

  const upsertProduct = db.prepare(`
    INSERT INTO products (sku, name, description, kind, currency, unit_amount, purchase_url, is_active, image_urls, prices_json)
    VALUES (@sku, @name, @description, @kind, @currency, @unit_amount, @purchase_url, @is_active, @image_urls, @prices_json)
    ON CONFLICT(sku) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      kind = excluded.kind,
      currency = excluded.currency,
      unit_amount = excluded.unit_amount,
      purchase_url = excluded.purchase_url,
      is_active = excluded.is_active,
      image_urls = excluded.image_urls,
      prices_json = excluded.prices_json
  `);

  const tx = db.transaction(() => {
    for (const p of products) {
      if (!p.sku || !p.name) continue;
      upsertProduct.run(p);
    }
    if (!hasProducts) {
      db.prepare("INSERT INTO news (title, body, created_at) VALUES (?, ?, ?)").run(
        "Willkommen",
        "Seed aktiv. Lege `data/products.json` an oder nutze die Admin-API zum Pflegen echter Produkte.",
        nowIso()
      );
    }
  });
  tx();
}


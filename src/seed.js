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

  const paymentLinks =
    p.payment_links && typeof p.payment_links === "object" && !Array.isArray(p.payment_links)
      ? Object.fromEntries(
          Object.entries(p.payment_links)
            .map(([k, v]) => [String(k).toLowerCase().trim(), String(v).trim()])
            .filter(([k, v]) => k && v)
        )
      : {};

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
    payment_links_json: JSON.stringify(paymentLinks),
  };
}

// Default-Liste der Payment-Provider, die auch im echten Freetime Maker Shop
// (https://freetimemaker.github.io/Freetime-Maker-Shop) verlinkt sind.
const DEFAULT_PAYMENT_PROVIDERS = [
  {
    slug: "oxapay",
    name: "OxaPay",
    kind: "crypto",
    website: "https://oxapay.com",
    logo_url: "https://freetimemaker.github.io/Freetime-Maker-Shop/images/oxa.png",
    description: "Crypto payment gateway used in the Freetime Maker Shop.",
  },
  {
    slug: "speedpay",
    name: "SpeedPay",
    kind: "crypto",
    website: "https://tryspeed.com",
    logo_url: "https://freetimemaker.github.io/Freetime-Maker-Shop/images/speedpay.png",
    description: "Bitcoin Lightning checkout via tryspeed.com.",
  },
  {
    slug: "plisio",
    name: "Plisio",
    kind: "crypto",
    website: "https://plisio.net",
    logo_url: "https://freetimemaker.github.io/Freetime-Maker-Shop/images/plisio.png",
    description: "Crypto payment processor (Plisio).",
  },
  {
    slug: "nowpayments",
    name: "NowPayments",
    kind: "crypto",
    website: "https://nowpayments.io",
    logo_url: "https://freetimemaker.github.io/Freetime-Maker-Shop/images/nowpayments.png",
    description: "Crypto payment processor (NowPayments).",
  },
  {
    slug: "ncwallet",
    name: "NC Wallet",
    kind: "crypto",
    website: "https://ncwallet.net",
    logo_url: null,
    description: "NC Wallet pay links (used for donations).",
  },
  {
    slug: "coinbase",
    name: "Coinbase",
    kind: "crypto",
    website: "https://commerce.coinbase.com",
    logo_url: null,
    description:
      "Coinbase Commerce. After payment the buyer receives an e-mail with the redirect link.",
  },
  {
    slug: "gumroad",
    name: "Gumroad",
    kind: "digital_goods",
    website: "https://freetimemaker.gumroad.com",
    logo_url: null,
    description: "Alternative shop on Gumroad.",
  },
];

function seedPaymentProviders(db) {
  const upsert = db.prepare(`
    INSERT INTO payment_providers (slug, name, kind, website, logo_url, description, is_active)
    VALUES (@slug, @name, @kind, @website, @logo_url, @description, 1)
    ON CONFLICT(slug) DO NOTHING
  `);
  const tx = db.transaction(() => {
    for (const p of DEFAULT_PAYMENT_PROVIDERS) upsert.run(p);
  });
  tx();
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
    INSERT INTO products (sku, name, description, kind, currency, unit_amount, purchase_url, is_active, image_urls, prices_json, payment_links_json)
    VALUES (@sku, @name, @description, @kind, @currency, @unit_amount, @purchase_url, @is_active, @image_urls, @prices_json, @payment_links_json)
    ON CONFLICT(sku) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      kind = excluded.kind,
      currency = excluded.currency,
      unit_amount = excluded.unit_amount,
      purchase_url = excluded.purchase_url,
      is_active = excluded.is_active,
      image_urls = excluded.image_urls,
      prices_json = excluded.prices_json,
      payment_links_json = excluded.payment_links_json
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

  seedPaymentProviders(db);
}


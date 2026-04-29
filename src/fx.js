import { env } from "./env.js";

const OER_BASE_URL = "https://openexchangerates.org/api";

export async function fetchOerLatest({ includeAlternative }) {
  if (!env.oerAppId) {
    return { ok: false, error: "missing_app_id" };
  }

  const url = new URL(`${OER_BASE_URL}/latest.json`);
  url.searchParams.set("app_id", env.oerAppId);
  url.searchParams.set("prettyprint", "0");
  if (includeAlternative) url.searchParams.set("show_alternative", "1");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "freetime-maker-shop-api/0.1.0" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: "http_error", status: res.status, body: text.slice(0, 300) };
  }
  const json = await res.json();
  return { ok: true, data: json };
}

export async function fetchOerCurrencies({ includeAlternative }) {
  const url = new URL(`${OER_BASE_URL}/currencies.json`);
  url.searchParams.set("prettyprint", "0");
  if (includeAlternative) url.searchParams.set("show_alternative", "1");

  const res = await fetch(url.toString(), {
    headers: { "user-agent": "freetime-maker-shop-api/0.1.0" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: "http_error", status: res.status, body: text.slice(0, 300) };
  }
  const json = await res.json();
  return { ok: true, data: json };
}

export function upsertFxRatesFromLatest(db, latest) {
  const base = String(latest.base ?? "USD").toUpperCase();
  const updatedAt = latest.timestamp
    ? new Date(Number(latest.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const rates = latest.rates && typeof latest.rates === "object" ? latest.rates : {};

  const upsert = db.prepare(`
    INSERT INTO fx_rates (from_currency, to_currency, rate, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(from_currency, to_currency) DO UPDATE SET
      rate = excluded.rate,
      updated_at = excluded.updated_at
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const [to, rateRaw] of Object.entries(rates)) {
      const toCcy = String(to).toUpperCase();
      const rate = Number(rateRaw);
      if (!toCcy || !Number.isFinite(rate) || rate <= 0) continue;
      upsert.run(base, toCcy, rate, updatedAt);
      count += 1;
    }
    // auch base->base speichern
    upsert.run(base, base, 1, updatedAt);
  });
  tx();

  return { base, updated_at: updatedAt, count };
}


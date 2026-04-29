import crypto from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";

import { env } from "./env.js";
import { migrate, openDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    const allow = env.corsAllowOrigins.trim();
    if (allow === "*") return cb(null, true);
    if (!origin) return cb(null, false);
    const allowed = allow.split(",").map((s) => s.trim()).filter(Boolean);
    cb(null, allowed.includes(origin));
  },
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "Freetime Maker Shop API",
      version: "0.1.0",
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
});

const db = openDb();
migrate(db);
seedIfEmpty(db);

app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

app.get("/products", async (req) => {
  const activeOnly = req.query?.active_only !== "false";
  const stmt = activeOnly
    ? db.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY id ASC")
    : db.prepare("SELECT * FROM products ORDER BY id ASC");
  const rows = stmt.all();
  return rows.map((p) => ({ ...p, is_active: Boolean(p.is_active) }));
});

app.get("/products/:sku", async (req, reply) => {
  const { sku } = req.params;
  const p = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku);
  if (!p) return reply.code(404).send({ detail: "product_not_found" });
  return { ...p, is_active: Boolean(p.is_active) };
});

app.get("/news", async (req) => {
  const limit = Math.max(1, Math.min(Number(req.query?.limit ?? 50), 200));
  const rows = db
    .prepare("SELECT * FROM news ORDER BY created_at DESC LIMIT ?")
    .all(limit);
  return rows;
});

const CheckoutIn = z.object({
  email: z.string().email(),
  items: z
    .array(
      z.object({
        product_sku: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(100).default(1),
      })
    )
    .min(1),
  payment_provider: z.string().max(64).optional().nullable(),
});

app.post("/checkout", async (req, reply) => {
  const parsed = CheckoutIn.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ detail: "invalid_payload", issues: parsed.error.issues });
  }
  const payload = parsed.data;

  const skus = [...new Set(payload.items.map((i) => i.product_sku))];
  const placeholders = skus.map(() => "?").join(",");
  const products = db
    .prepare(`SELECT * FROM products WHERE sku IN (${placeholders})`)
    .all(...skus);
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const missing = payload.items.map((i) => i.product_sku).filter((s) => !bySku.has(s));
  if (missing.length) {
    return reply.code(400).send({ detail: { code: "unknown_product_sku", skus: missing } });
  }

  const currency = products[0]?.currency ?? "USD";
  for (const p of products) {
    if (p.currency !== currency) {
      return reply.code(400).send({ detail: "mixed_currency_not_supported" });
    }
  }

  let total = 0;
  const now = new Date().toISOString();
  const publicId = newPublicId("ord");
  const status = payload.payment_provider ? "pending_payment" : "created";

  const tx = db.transaction(() => {
    const orderRes = db
      .prepare(
        `
        INSERT INTO orders (public_id, email, status, payment_provider, currency, total_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(publicId, payload.email, status, payload.payment_provider ?? null, currency, 0, now);

    const orderId = orderRes.lastInsertRowid;

    const insertItem = db.prepare(
      `
        INSERT INTO order_items (order_id, product_id, quantity, unit_amount, currency)
        VALUES (?, ?, ?, ?, ?)
      `
    );

    for (const it of payload.items) {
      const p = bySku.get(it.product_sku);
      const unit = Number(p.unit_amount ?? 0);
      total += unit * Number(it.quantity);
      insertItem.run(orderId, p.id, Number(it.quantity), unit, currency);
    }

    db.prepare("UPDATE orders SET total_amount = ? WHERE id = ?").run(total, orderId);
  });
  tx();

  return reply.code(201).send({
    order_id: publicId,
    status,
    currency,
    total_amount: total,
    payment_provider: payload.payment_provider ?? null,
  });
});

app.get("/orders/:order_id", async (req, reply) => {
  const { order_id } = req.params;
  const o = db.prepare("SELECT * FROM orders WHERE public_id = ?").get(order_id);
  if (!o) return reply.code(404).send({ detail: "order_not_found" });

  const items = db
    .prepare(
      `
      SELECT oi.quantity, oi.unit_amount, oi.currency, p.sku AS product_sku, p.name AS name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
      ORDER BY oi.id ASC
    `
    )
    .all(o.id);

  return {
    order_id: o.public_id,
    email: o.email,
    status: o.status,
    currency: o.currency,
    total_amount: o.total_amount,
    created_at: o.created_at,
    fulfillment_code: o.fulfillment_code ?? null,
    items,
  };
});

const FulfillIn = z.object({ fulfillment_code: z.string().min(1).max(200) });

app.post("/orders/:order_id/fulfill", async (req, reply) => {
  const { order_id } = req.params;
  const parsed = FulfillIn.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ detail: "invalid_payload", issues: parsed.error.issues });
  }
  const o = db.prepare("SELECT * FROM orders WHERE public_id = ?").get(order_id);
  if (!o) return reply.code(404).send({ detail: "order_not_found" });

  db.prepare("UPDATE orders SET status = 'fulfilled', fulfillment_code = ? WHERE id = ?").run(
    parsed.data.fulfillment_code,
    o.id
  );
  return reply.redirect(303, `/orders/${order_id}`);
});

const SupportIn = z.object({
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(10000),
});

app.post("/support/tickets", async (req, reply) => {
  const parsed = SupportIn.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ detail: "invalid_payload", issues: parsed.error.issues });
  }
  const publicId = newPublicId("sup");
  db.prepare(
    `
      INSERT INTO support_tickets (public_id, email, subject, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(publicId, parsed.data.email, parsed.data.subject, parsed.data.message, new Date().toISOString());

  return reply.code(201).send({ ticket_id: publicId, created_at: new Date().toISOString() });
});

function newPublicId(prefix) {
  // kurz + URL-safe
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

await app.listen({ host: env.host, port: env.port });


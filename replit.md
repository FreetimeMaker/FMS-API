# Freetime Maker Shop API

## Overview
Official API for the Freetime Maker Shop (Web + Android), built with Node.js and Fastify. Provides endpoints for products, news, checkout/orders, fulfillment, support tickets, and FX/currency conversion. Includes Swagger UI for API exploration.

## Tech Stack
- **Runtime**: Node.js 20
- **Framework**: Fastify 5
- **Database**: SQLite (better-sqlite3) — stored in `./fms.db`
- **Validation**: Zod
- **API docs**: `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`
- **CORS**: `@fastify/cors`

## Project Layout
- `src/server.js` — Main Fastify server with all routes
- `src/db.js` — SQLite open + migrations
- `src/seed.js` — Initial data seeding
- `src/env.js` — Environment variable loading
- `src/fx.js` — FX rate providers (Frankfurter, CoinGecko, OpenExchangeRates)
- `data/products.json` — Hot-reloadable product catalog
- `fms.db` — SQLite database (auto-created)

## Running in Replit
The workflow `Start application` runs `npm run dev` with `FMS_PORT=5000` and `FMS_HOST=0.0.0.0` so the API is exposed on Replit's public preview port.

- Health check: `/health`
- Swagger UI: `/docs`

## Configuration
Environment variables (see `.env.example`):
- `FMS_PORT` — server port (set to 5000 in the workflow for Replit preview)
- `FMS_HOST` — bind address (0.0.0.0 in Replit)
- `FMS_DB_PATH` — SQLite path (default `./fms.db`)
- `FMS_CORS_ALLOW_ORIGINS` — CORS origins (default `*`)
- `FMS_ADMIN_TOKEN` — enables `/admin/*` routes via `x-admin-token` header
- `FMS_FX_PROVIDER` — `no-key` (default) or `openexchangerates`
- `FMS_OER_APP_ID` — OpenExchangeRates app id (only when provider is `openexchangerates`)
- `FMS_FX_REFRESH_SECONDS` — FX auto-refresh interval (default 3600)
- `FMS_CRYPTO_IDS` — CoinGecko coin IDs to import

## Payment Providers
The API supports the same payment providers used on the live shop at
https://freetimemaker.github.io/Freetime-Maker-Shop:

- **OxaPay** (`oxapay`) — crypto
- **SpeedPay / TrySpeed** (`speedpay`) — Bitcoin Lightning
- **Plisio** (`plisio`) — crypto
- **NowPayments** (`nowpayments`) — crypto
- **NC Wallet** (`ncwallet`) — crypto donations
- **Coinbase** (`coinbase`) — crypto (manual e-mail redirect)
- **Gumroad** (`gumroad`) — alternative shop

Endpoints:
- `GET /payment-providers` — list providers (`?active_only=false` for all)
- `GET /payment-providers/:slug` — single provider
- `GET /products/:sku/payment-providers` — providers configured for a product, with the
  ready-to-use `checkout_url` per provider
- `PUT /admin/payment-providers/:slug` — admin upsert (`x-admin-token` required)
- `DELETE /admin/payment-providers/:slug` — admin soft-delete

Per-product checkout URLs live in `products.payment_links` (slug → URL). When `/checkout`
is called with a `payment_provider`, the response includes a `payment_urls[]` array with
the matching hosted checkout URL for each item.

Seeded data (`data/products.json`) includes the real First Background and Donation links
from the live shop.

## Deployment
Configured for **VM** deployment target (because SQLite needs persistent local storage). Run command: `FMS_PORT=5000 FMS_HOST=0.0.0.0 npm start`.

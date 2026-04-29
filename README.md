# Freetime-Maker-Shop-API
Offizielle API für den **Freetime Maker Shop** (Web + Android) — mit **Node.js (Fastify)**.

## Features (MVP)
- **Produkte**: `GET /products`, `GET /products/:sku`
- **News**: `GET /news`
- **Checkout / Bestellungen**: `POST /checkout`, `GET /orders/:order_id`
- **Fulfillment (manuell)**: `POST /orders/:order_id/fulfill` (setzt z.B. einen Code, den du dann dem Käufer per E‑Mail senden kannst)
- **Support**: `POST /support/tickets`
- **Swagger/OpenAPI**: `GET /docs`

## Lokales Setup

```bash
npm install
npm run dev
```

Dann im Browser:
- Swagger UI: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## Konfiguration
Optional per Env-Var (oder `.env`, siehe `.env.example`):
- **`FMS_PORT`**: Default `8000`
- **`FMS_HOST`**: Default `0.0.0.0`
- **`FMS_DB_PATH`**: Default `./fms.db`
- **`FMS_CORS_ALLOW_ORIGINS`**: Default `*` (kommagetrennt möglich)

## Hinweis zu Zahlungen
Dieses MVP erstellt Bestellungen und speichert den gewünschten `payment_provider`, integriert aber (noch) keine Provider-APIs.

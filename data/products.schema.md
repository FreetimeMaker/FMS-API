## `data/products.json` Schema (Kurz)

Datei ist ein Array von Produkten.

### Minimal
- `sku` (string, eindeutig)
- `name` (string)
- `kind` (`digital` | `donation` | `token` | `support`)

### Optional / empfohlen
- `description` (string)
- `purchase_url` (string | null)
- `is_active` (boolean)
- `images` (string[]) – Bild-URLs
- `prices` (object) – Währung => Preis in Cent/Minor Units
- `payment_links` (object) – Provider-Slug => fertige Checkout-URL.
  Slug muss in der `payment_providers`-Tabelle vorhanden sein
  (siehe `GET /payment-providers`). Diese URLs werden vom `/checkout`-Endpoint
  zurückgegeben, wenn der Käufer einen passenden `payment_provider` wählt.

Beispiel:

```json
[
  {
    "sku": "first-background",
    "name": "First Background",
    "kind": "digital",
    "description": "…",
    "images": ["https://…/1.png", "https://…/2.png"],
    "prices": { "USD": 1000, "EUR": 900, "CHF": 950 },
    "payment_links": {
      "oxapay": "https://pay.oxapay.com/...",
      "speedpay": "https://buy.tryspeed.com/...",
      "plisio": "https://plisio.net/payment-button/new/...",
      "nowpayments": "https://nowpayments.io/payment/?iid=..."
    },
    "is_active": true
  }
]
```

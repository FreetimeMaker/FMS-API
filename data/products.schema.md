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
    "is_active": true
  }
]
```


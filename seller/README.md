# Seller: x402-paywalled Signal API

Adapted from [circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments)
(Next.js seller + x402 middleware + Circle Gateway verification + batch settlement on Arc).

Landing in week 3:

- vendor the starter kit's seller app
- replace the demo paywalled resource with `GET /signals/latest` serving
  price-radar-format signals (see `agent/signals/schema.py`)
- keep the starter kit's seller dashboard for payment monitoring

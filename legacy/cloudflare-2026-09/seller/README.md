# Seller: x402-paywalled Signal API

The seller is now implemented by the root Next.js application.

- `GET /api/health` is public.
- `GET /api/signals/latest?symbol=ETH-USD` costs `0.001` USDC by default.
- An unpaid request returns HTTP 402 and Circle Gateway batching requirements.
- A paid request is verified and settled through Circle's batching facilitator.
- The response is built from Coinbase Exchange one-minute candles.
- If the upstream feed is unavailable, the endpoint returns an explicit,
  non-actionable stale signal so a paid request never causes an unsafe action.

The x402 wrapper in `lib/x402.ts` follows the official
[`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments)
starter kit.

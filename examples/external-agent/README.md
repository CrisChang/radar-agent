# External agent HTTP integration

This is a separate HTTP client implementation maintained in this repository,
not evidence of a third-party user. It reads health, OpenAPI and the unpaid x402
challenge. It never loads `.env.local`, creates a wallet, signs or pays.

Start the local service with a **testnet** seller address. Then run:

```bash
npm run agent:probe -- --url http://127.0.0.1:3016 --network testnet \
  --seller 0x1111111111111111111111111111111111111111 --save
```

The address above is a test fixture, not a payment destination. Use the actual
allowlisted seller for a real service. `--max-atomic 1000` defaults to 0.001 USDC
at 6 decimals; it is only an offer-check limit, not a payment authorization.
`--save` saves an explicitly **unpaid** observation to `docs/evidence/`.

The probe rejects unexpected chains, assets, authorization domains, excessive
prices and (when `--seller` is supplied) substituted recipients. HTTPS is required
except for loopback development. Redirects are refused. No automatic payment
retry exists. Mainnet execution is deliberately blocked in the seller release.

For the paid pilot, additionally implement durable request reservation and payment
recovery, validate fresh output and its response digest, reconcile batch settlement,
and get explicit owner approval for the participating wallets and total budget.
See [the launch gates](../../docs/ARC_MAINNET_PLAN.md).

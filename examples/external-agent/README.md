# External agent examples

`probe.mts` discovers the live feed, storage readiness and exact 402 offer
without a wallet key, signature or payment. Run `npm run agent:probe` after
configuring the public origin and expected seller in the ignored local env.

The complete budgeted buyer is `agent/radar.mts`, invoked with
`npm run agent:mainnet -- --allow-mainnet` only after an explicit approved pilot.
It requires the configured key to match `BUYER_ADDRESS`, pins the seller and
price, reserves spend before signing and stops on uncertainty. No automatic
deposit is performed.

`bills.mts` creates a five-minute, read-only wallet authorization and retrieves
that wallet's receipts. Run `npm run agent:bills -- --allow-read-signature` only
when ready to create that read signature. It never prints the key or signature.
Browser operators can use `/billing` without exporting a key.

API schemas are served at `/api/openapi`. The full flow and authentication
message are documented in [Agent integration](../../docs/AGENT_INTEGRATION.md).

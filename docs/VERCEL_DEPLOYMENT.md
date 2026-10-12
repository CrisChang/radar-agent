# Radar Agent on Vercel

Hosting choice confirmed by the user on October 8, 2026. Deploy the seller
website and API; keep the buyer agent and its credentials on the local Mac.

## Ready locally

- `vercel.json` selects Next.js with `npm ci` and `npm run build`.
- Node is pinned to the tested 22.x runtime.
- `.vercelignore` excludes all environment files, wallet key files, buyer
  scripts/state, documentation, tests and local build output from CLI uploads.
- `/api/health?feed=1` checks fresh Coinbase data without any wallet signature
  or payment and returns metadata only. A failed feed produces HTTP 503.
- `npm run check:deployment -- --url https://YOUR_URL --network mainnet --check-feed`
  verifies the network, unpaid 402 quote and actual hosted market feed.

## Account and billing gate

CLI device authentication and the user-operated two-factor setup completed
on October 8. The owner activated Pro Trial for team `chris-6239` on
October 9. Project `radar-agent` is
linked; Node 22.x, Next.js and the verified build commands are configured.
Do not paste passwords, access tokens or payment information into chat.

Vercel Hobby is limited to personal non-commercial use. A real USDC-paid API
needs an eligible Pro/Enterprise account under Vercel's commercial-use rules.
Pro is currently advertised at $20/month, including $20 usage credit; taxes,
additional developer seats and usage beyond the included credit may add costs.
The official Pro trial lasts 14 days with $20 credit. Without a payment method,
it does not charge and reverts to Hobby when the trial ends. Trial eligibility
is limited to one per user. Prefer an unbilled trial for the initial grant demo
if available. On this account, both the official trial upgrade and Create
Team > Pro Trial currently require card details. The actual form states that
trial ends after 14 days or exhausted credit, then automatically renews at
$20/month plus applicable CDN tier, taxes and metered usage. The owner
personally completed activation. The Billing page shows the trial
period October 9–23, 2026 and an upcoming base invoice of $20. A local reminder
is scheduled for October 18 at 10:00 Asia/Shanghai to review cancellation and
hosting needs; no cancellation or additional purchase has been made. Trial reference:
https://vercel.com/docs/plans/pro-plan/trials. Source: https://vercel.com/pricing and
https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage.

## Deployment sequence

1. Authenticate with official Vercel CLI and identify the intended account/team.
2. Confirm a controlled Arc mainnet seller address. The historical `.env.local`
   belongs to the testnet MVP and must not be copied into cloud environment vars.
3. Link this repository to a Vercel project named `radar-agent` (or reuse an
   existing matching project). Use the account's appropriate commercial plan.
4. Inspect `vercel deploy --dry --format=json` before uploading. Ensure the
   included files contain no environment files, keys or private Twitter data.
5. Configure seller-only environment variables:

```dotenv
ARC_NETWORK=mainnet
PUBLIC_BASE_URL=https://YOUR_PRODUCTION_DOMAIN
SELLER_ADDRESS=0xefc70a0dedefee6a010bac44de489bafb2fd8422
SIGNAL_PRICE_USDC=0.001
RADAR_ALLOW_DEMO_SIGNALS=false
RADAR_ACCEPT_PAYMENTS=true
```

6. Deploy with `vercel deploy --prod`. Pin `PUBLIC_BASE_URL` to the actual
   production domain before validating payments. Do not use `--public`, which
   exposes uploaded source code, or upload a buyer private key/Circle secret.
7. Run the read-only deployment check above. HTTP 200 for the homepage and
   health, HTTP 402 for an unpaid request, and `feed.status=live` are required.
   These checks do not prove a paid mainnet transaction.
8. Connect the retained Upstash Redis integration described in
   [payment recovery](PAYMENT_RECOVERY.md), then probe storage readiness. The
   durable state machine is ported; missing storage keeps payments disabled.
9. Only after the hosting and recovery checks pass, configure the separate local buyer and
   obtain the approved wallet, recipient and USDC budget for the grant proof.

The hosting choice does not authorize chain funding, signing or USDC spending.
Retain buyer audit logs locally because Vercel function filesystems are ephemeral.

## Current status — October 12, 2026

- Public origin: https://radar-agent-ivory.vercel.app.
- Production deployment: `dpl_6M1X3nSJiTryGCLV86s4MghGKtCn`, source `e01709c`.
- Standard Protection makes the production domain public while generated
  deployment and preview URLs still require Vercel login.
- Sixteen anonymous checks pass: pages, live feed, durable storage, 402 quote,
  billing authentication, OpenAPI, bounded funding quote, wrong-wallet refusal,
  balance read, bounded allowance review, wrong-wallet allowance refusal,
  zero-allowance verification, the durable pilot cap, logo and preview protection. No protection bypass was used.
- Wallet-confirmed payments are enabled at 0.001 USDC. Funding is optional and
  exactly 0.01 USDC, with a 0.005 USDC gas cap per funding transaction.
- Free Upstash Redis remains connected with eviction disabled. Secret server
  variables are integration-managed; no buyer key is hosted.
- 70 tests, TypeScript and the production build pass. The dry-run manifest
  contains 49 entries and excludes environment files, keys and buyer state.
- Owner Gateway deposit and zero-allowance revoke are verified. The signed
  billing lookup returned 404; paid delivery/receipts remain pending. One explicit
  recovery attempt is available under a durable same-wallet settlement cap.
- Application is on the final DoraHacks step with owner-supplied contacts and
  deployment history and a verified funding hash filled; paid functionality
  verification and final review remain. No application has been submitted.

[Public deployment evidence](deployment-public-vercel-2026-10-12.json).
Earlier October 9 records retain their historical statuses and recipients.

## Local network note

On this Mac, deployment-host checks use the existing local HTTPS proxy.
Anonymous checks use ordinary curl with no cookies or protection bypass.
Official Vercel CLI commands use its existing authorization. Never publish
request cookies, protection tokens, keys or private wallet balances.

## Buyer and seller correction

PILOT_BUYER_ADDRESS is the funded buyer, independent from SELLER_ADDRESS.
Current buyer: 0xefc70a0dedefee6a010bac44de489bafb2fd8422.
Current owner-confirmed recipient: 0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C.
The earlier signature was rejected with self_transfer before settlement.
Current anonymous checks decode the 402 offer to verify the new recipient and
exact 0.001 USDC price, and refuse funding calls from the recipient address.
The buyer keeps its existing Gateway deposit; no extra funding is required.

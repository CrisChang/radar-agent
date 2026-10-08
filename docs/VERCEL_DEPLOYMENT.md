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

No Vercel project or CLI authentication existed on this machine when deployment
started. Complete the official CLI device login in your own Vercel account.
Do not paste passwords, access tokens or payment information into chat.

Vercel Hobby is limited to personal non-commercial use. A real USDC-paid API
needs an eligible Pro/Enterprise account under Vercel's commercial-use rules.
Pro is currently advertised at $20/month, including $20 usage credit; taxes,
additional developer seats and usage beyond the included credit may add costs.
A paid upgrade or new subscription must be confirmed with its actual billing
terms before purchase. Source: https://vercel.com/pricing and
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
SELLER_ADDRESS=<controlled Arc mainnet recipient>
SIGNAL_PRICE_USDC=0.001
RADAR_ALLOW_DEMO_SIGNALS=false
```

6. Deploy with `vercel deploy --prod`. Pin `PUBLIC_BASE_URL` to the actual
   production domain before validating payments. Do not use `--public`, which
   exposes uploaded source code, or upload a buyer private key/Circle secret.
7. Run the read-only deployment check above. HTTP 200 for the homepage and
   health, HTTP 402 for an unpaid request, and `feed.status=live` are required.
   These checks do not prove a paid mainnet transaction.
8. Only after the hosting checks pass, configure the separate local buyer and
   obtain the approved wallet, recipient and USDC budget for the grant proof.

The hosting choice does not authorize chain funding, signing or USDC spending.
Retain buyer audit logs locally because Vercel function filesystems are ephemeral.

## Current status

Local deployment configuration is prepared. All 19 tests and the Next.js production build pass. A reviewed 22-file seller package (51,777 bytes zipped) is saved at `/private/tmp/radar-agent-vercel-seller.zip`; it contains no environment files or buyer runtime state. Official CLI upload dry-run still requires account authentication. Public deployment is pending Vercel
account authentication, suitable plan and a confirmed mainnet payment recipient.
No public hosting URL or real paid response has been produced yet.

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

CLI device authentication completed on October 8. The account has team
`chris-6239` on Hobby. Project `radar-agent` has been created and linked; Node
22.x, Next.js and the verified build commands are configured.
Do not paste passwords, access tokens or payment information into chat.

Vercel Hobby is limited to personal non-commercial use. A real USDC-paid API
needs an eligible Pro/Enterprise account under Vercel's commercial-use rules.
Pro is currently advertised at $20/month, including $20 usage credit; taxes,
additional developer seats and usage beyond the included credit may add costs.
The official Pro trial lasts 14 days with $20 credit. Without a payment method,
it does not charge and reverts to Hobby when the trial ends. Trial eligibility
is limited to one per user. Prefer an unbilled trial for the initial grant demo
if available. A paid upgrade or new subscription must be confirmed with its
actual billing terms before purchase. Trial reference:
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

- CLI authentication is complete.
- Vercel project: https://vercel.com/chris-6239/radar-agent
- The project is linked locally. Cloud settings use Node 22.x and the verified
  Next.js build/install commands.
- All 19 tests and the Next.js production build pass.
- Official Vercel upload dry-run succeeds: 22 regular files (191,137 bytes)
  plus five empty directory entries. Environment files, key files, buyer state,
  tests, private Twitter data and local build output are excluded.
- Team is still Hobby. Pro/trial choice and a controlled Arc mainnet recipient
  are pending user input; these block publication of the real paid service.
- No public deployment, new subscription, signature, deposit or payment has been
  made. Do not describe the project-dashboard URL as the live API URL.

The local package remains at `/private/tmp/radar-agent-vercel-seller.zip`.
The official file manifest is saved at
`/private/tmp/radar-agent-vercel-official-dry-run.json`.

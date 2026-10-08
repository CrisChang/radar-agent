# Arc Microgrants submission pack

Target: [Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq).
Deadline: October 14, 2026, 23:59 ET (October 15, 11:59 Asia/Shanghai).

## Scope and current gate

Continue the July Radar Agent MVP: a paid price-signal API and a
budget-constrained buyer on Arc mainnet using Circle Gateway. The feed uses
public Coinbase candles; the private Twitter Radar pipeline is not connected
or included in this public repository. Mainnet treasury execution is disabled
because the installed App Kit adapter lacks Arc mainnet support.

Code now supports both networks, final-quote checks before signing,
conservative accounting for signed payments, failed-resource cancellation,
explicit mainnet/deposit flags and network-isolated runtime state.

Verified locally on October 8, 2026:

- All 16 automated tests pass; production build and TypeScript checks pass.
- Local mainnet-mode homepage returns 200; unpaid signal endpoint returns
  402 with the expected chain, asset, recipient, price and absolute URL.
- Official mainnet RPC reports chain 5042; USDC and Gateway contracts exist
  and the Gateway facilitator advertises Arc mainnet batching.
- The configured historical buyer has zero mainnet USDC. No signatures or
  transactions were produced by the preflight check.
- The deterministic dry-run succeeds without funds.

**Unresolved runtime check:** Coinbase responds to an independent Python
request, but Node requests on this machine time out. The feed now retries
once and rejects stale/future-dated candles. Recheck live data from the
chosen hosting environment before enabling paid mainnet acceptance. This
local prototype has not completed a real paid query.

Submission still requires:

- Live data and deployment verification in the chosen hosting environment.
- An HTTPS seller deployment and a public repository with the reviewed code.
- One real mainnet paid response and its local audit/receipt.
- A confirmed Arc mainnet transaction and explorer link.
- A short demo recording and confirmation of no prior Circle/Arc funding.

Configuration checks and a local dry-run do not prove mainnet readiness.
Testnet-only projects and work already funded by Circle/Arc are ineligible.

## Seller deployment

The user selected Vercel on October 8. Follow [Vercel deployment steps](VERCEL_DEPLOYMENT.md); account authentication and a controlled mainnet recipient are still pending.

Use `npm ci`, `npm run build`, `npm start` on a Next.js host. The seller needs
only these environment variables:

```dotenv
ARC_NETWORK=mainnet
PUBLIC_BASE_URL=https://YOUR_DEPLOYMENT
SELLER_ADDRESS=<mainnet payment recipient>
SIGNAL_PRICE_USDC=0.001
RADAR_ALLOW_DEMO_SIGNALS=false
```

Never upload buyer keys, Circle API keys, entity secrets, `.env.local`,
`.env.mainnet.local`, private Twitter code or runtime state. Filesystem logs
are ephemeral on a serverless host; retain the buyer audit locally.

Verify the URL without signing or paying:

```bash
npm run check:deployment -- --url https://YOUR_DEPLOYMENT --network mainnet --check-feed
```

## Buyer and proof

Copy `.env.mainnet.example` to `.env.mainnet.local` locally. Use a dedicated
wallet, not the historical testnet key. Obtain approval for the actual wallet,
recipient and total USDC budget before mainnet signing, funding or payment.

Read-only RPC/contract/facilitator checks:

```bash
node_modules/.bin/tsx --env-file=.env.mainnet.local scripts/preflight.mts
```

After approval, purchase a live signal with treasury disabled:

```bash
npm run agent:mainnet -- --allow-mainnet
```

If a Gateway deposit is needed, set `GATEWAY_AUTO_DEPOSIT_USDC` to the approved
amount (at most `GATEWAY_MAX_DEPOSIT_USDC`) and add `--allow-deposit`. Gas is an
additional USDC cost; the deposit itself is an onchain funding action.

Retain `agent/state/mainnet/audit.jsonl`. A batched payment receipt may be an
acceptance identifier rather than a confirmed transaction hash: do not label
it as an onchain transaction. Use a confirmed deposit transaction or a later
confirmed batch settlement for the explorer proof. Do not publish signatures.

## Application draft (English)

**Project:** Radar Agent

**One-line description:** A USDC pay-per-query market-signal API with an
autonomous buyer that enforces spending limits before signing on Arc.

**What it does:** Radar Agent converts public ETH and BTC market candles into
timestamped price signals. Circle Gateway protects the API with x402
payments. The buyer validates the final price, recipient and network,
reserves a daily budget before sending the authorization, receives the
signal and logs an explainable decision. Failed or unavailable signals are
not settled. A circuit breaker and idempotency protect the optional testnet
treasury demonstration.

**Why Arc:** Arc USDC and Circle Gateway make per-query agent payments
possible. The chain, Gateway contract, asset and signing policy are explicitly
matched to mainnet. This is a small, auditable agent-commerce flow using real
market data.

**Development history:** Started for the Encode x Circle hackathon in July
2026; continued in October with mainnet payments, stronger authorization
checks, state separation and deployment verification.

**Live deployment:** REQUIRED — fill after deployment and verification.

**Public repository:** https://github.com/CrisChang/radar-agent — verify that
the reviewed October changes are published before submission.

**Mainnet transaction:** REQUIRED — confirmed explorer link.

**Demo:** REQUIRED — paid response, budget refusal and audit; clearly label
any synthetic fixture or dry-run as simulated.

**Builder profile:** https://github.com/CrisChang

**Prior Circle/Arc funding:** REQUIRED — confirm with the user. Participation
in a hackathon is not proof of a grant or prize payment.

Do not submit while required links or eligibility confirmation are missing.

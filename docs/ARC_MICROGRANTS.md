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

- All 20 automated tests pass; production build and TypeScript checks pass.
- Local mainnet-mode homepage returns 200; unpaid signal endpoint returns
  402 with the expected chain, asset, recipient, price and absolute URL.
- Official mainnet RPC reports chain 5042; USDC and Gateway contracts exist
  and the Gateway facilitator advertises Arc mainnet batching.
- The configured historical buyer has zero mainnet USDC. No signatures or
  transactions were produced by the preflight check.
- The deterministic dry-run succeeds without funds.

**Hosted runtime check:** The October 8 Vercel production build succeeded.
Authenticated owner checks confirm fresh Coinbase data, health 200, unpaid
402, chain 5042, price 0.001 USDC and the user-confirmed mainnet recipient.
See [cloud check record](deployment-vercel-2026-10-08.json). Local Node direct
requests still time out; the cloud feed works. The deployment retains Vercel
login protection and the planned public origin has not been promoted.
No real paid query has been completed.

The [bilingual application draft](submission/ARC_MICROGRANTS_APPLICATION.md),
[demo script](submission/ARC_MICROGRANTS_DEMO.md) and
[submission checklist](submission/ARC_MICROGRANTS_CHECKLIST.md) are prepared.
The owner confirmed that the configured recipient is also the test wallet.
The historical local signing key does not match it; no key was reused.
Mainnet signing now requires an explicit matching `BUYER_ADDRESS`.

After fetching GitHub, the main branch was found to contain September durable
receipt/recovery work and historical testnet media. The October Vercel branch
is divergent and is prepared on a separate branch; preserve that work and port the
recovery implementation before the paid mainnet pilot.

Submission still requires:

- Anonymous public deployment verification after eligible trial/plan activation.
- An HTTPS seller deployment and a public repository with the reviewed code.
- Durable recovery integration on Vercel, then one real mainnet paid response
  and its local audit/receipt.
- A confirmed Arc mainnet transaction and explorer link.
- A short demo recording and confirmation of no prior Circle/Arc funding.

Configuration checks and a local dry-run do not prove mainnet readiness.
Testnet-only projects and work already funded by Circle/Arc are ineligible.

## Seller deployment

The user selected Vercel on October 8. Follow [Vercel deployment steps](VERCEL_DEPLOYMENT.md); account authentication, two-factor setup, seller configuration and a protected cloud deployment are complete. The user confirmed the mainnet recipient. The actual trial form requires a card and automatic renewal; activation awaits the user's acceptance. Public promotion and anonymous checks remain pending.

Use `npm ci`, `npm run build`, `npm start` on a Next.js host. The seller needs
only these environment variables:

```dotenv
ARC_NETWORK=mainnet
PUBLIC_BASE_URL=https://YOUR_DEPLOYMENT
SELLER_ADDRESS=0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C
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
wallet, not the historical testnet key. Set `BUYER_ADDRESS` to the approved
identity; a mismatched key is refused before any paid request. Obtain approval for the actual wallet,
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

**Live deployment:** REQUIRED — protected cloud build is ready at
https://radar-agent-jihme1ww1-chris-6239.vercel.app; publish and verify
https://radar-agent-ivory.vercel.app after the eligible plan is active.

**Public repository:** https://github.com/CrisChang/radar-agent.
The October branch is prepared locally; its intended source link is
https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants.
Branch publication is awaiting GitHub authorization.
The default branch retains September integration work and historical testnet media.

**Mainnet transaction:** REQUIRED — confirmed explorer link.

**Demo:** REQUIRED — paid response, budget refusal and audit; clearly label
any synthetic fixture or dry-run as simulated.

**Builder profile:** https://github.com/CrisChang

**Prior Circle/Arc funding:** REQUIRED — confirm with the user. Participation
in a hackathon is not proof of a grant or prize payment.

Do not submit while required links or eligibility confirmation are missing.

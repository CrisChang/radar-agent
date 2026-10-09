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

Latest local validation on October 9, 2026:

- All 56 automated tests pass; production build and TypeScript checks pass.
- Local mainnet-mode homepage returns 200; unpaid signal endpoint returns
  402 with the expected chain, asset, recipient, price and absolute URL.
- Official mainnet RPC reports chain 5042; USDC and Gateway contracts exist
  and the Gateway facilitator advertises Arc mainnet batching.
- The historical signing identity was not reused. No signatures or transactions
  were produced by the earlier read-only preflight check.
- The deterministic dry-run succeeds without funds.

**Hosted runtime check:** The October 8 Vercel production build succeeded.
Authenticated owner checks confirm fresh Coinbase data, health 200, unpaid
402, chain 5042, price 0.001 USDC and the user-confirmed mainnet recipient.
See [current wallet correction checks](deployment-wallet-vercel-2026-10-09.json).
Earlier cloud/storage records retain the previous recipient and are historical. Local Node direct
requests still time out; the cloud feed works. The deployment retains Vercel
login protection and the planned public origin has not been promoted.
No real paid query has been completed.

The [bilingual application draft](submission/ARC_MICROGRANTS_APPLICATION.md),
[demo script](submission/ARC_MICROGRANTS_DEMO.md) and
[submission checklist](submission/ARC_MICROGRANTS_CHECKLIST.md) are prepared.
The owner confirmed that the configured recipient is also the test wallet.
The owner corrected the mainnet wallet and recipient to `0xefc70a0dedefee6a010bac44de489bafb2fd8422`
on October 9. No historical testnet signing key is configured for the mainnet
pilot or reused; previous deployment records retain the former recipient.
Mainnet signing now requires an explicit matching `BUYER_ADDRESS`.

After fetching GitHub, the main branch was found to contain September durable
receipt/recovery work and historical testnet media. The October Vercel branch
is divergent and is prepared on a separate branch. Its recovery state machine
and budget protections are now ported to a Vercel-compatible Redis adapter.
Free Upstash Redis is now connected with eviction disabled. Storage readiness
and five synthetic signed billing checks pass; the approved paid mainnet pilot
remains pending. See [historical storage activation](deployment-storage-vercel-2026-10-09.json)
and the ten passing [current wallet checks](deployment-wallet-vercel-2026-10-09.json).

Remaining validation and submission work:

- Anonymous public deployment verification after eligible trial/plan activation.
- An HTTPS seller deployment and a public repository with the reviewed code.
- One approved real mainnet paid response and its local audit/receipt.
- A confirmed Arc mainnet transaction and explorer link.
- A short demo recording.

The owner confirmed on October 8, 2026 that this project has received no prior
prizes or funding, including from Circle or Arc.

Configuration checks and a local dry-run do not prove mainnet readiness.
Testnet-only projects and work already funded by Circle/Arc are ineligible.

## Seller deployment

The user selected Vercel on October 8. Follow [Vercel deployment steps](VERCEL_DEPLOYMENT.md); account authentication, two-factor setup, seller configuration and a protected cloud deployment are complete. The user confirmed the mainnet recipient. The owner completed Pro Trial activation on October 9; Billing shows October 23 as the end date, and a local reminder is scheduled for October 18 at 10:00 Asia/Shanghai. Public promotion and anonymous checks remain pending.

Use `npm ci`, `npm run build`, `npm start` on a Next.js host. The seller needs
only these environment variables:

```dotenv
ARC_NETWORK=mainnet
PUBLIC_BASE_URL=https://YOUR_DEPLOYMENT
SELLER_ADDRESS=0xefc70a0dedefee6a010bac44de489bafb2fd8422
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

Automatic Gateway deposits are disabled. If funding is needed, prepare a
separate exact deposit amount and gas cap for owner approval. A deposit is
an onchain funding action, separate from the 0.001 USDC API purchase.

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
https://radar-agent-galvp9yot-chris-6239.vercel.app; publish and verify
https://radar-agent-ivory.vercel.app after the eligible plan is active.

**Public repository:** https://github.com/CrisChang/radar-agent.
The October branch is published at
https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants.
The default branch retains September integration work and historical testnet media.

**Mainnet transaction:** REQUIRED — confirmed explorer link.

**Demo:** Recording script prepared for paid response, budget refusal and audit; clearly label
any synthetic fixture or dry-run as simulated.

**Builder profile:** https://github.com/CrisChang

**Prior Circle/Arc prizes or funding:** None. The owner confirmed on
October 8, 2026 that this project has received no previous prizes or funding.
Participation in a hackathon is not proof of a grant or prize payment.

Do not submit while required links or mainnet evidence are missing. The prior
funding declaration is recorded above; other application requirements still apply.

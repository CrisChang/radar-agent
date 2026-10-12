# Radar Agent

> An agent commerce prototype with USDC per-query market signals,
> deterministic spending checks and a local buyer audit. Mainnet treasury
> execution remains disabled in this October Vercel branch.

Originally built for the **Encode Club × Circle [Programmable Money Hackathon](https://www.encodeclub.com/programmes/arc-hackathon)** — Agentic Economy track, July–August 2026.
Continued for **[Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq)** in October 2026. See [the submission and deployment pack](docs/ARC_MICROGRANTS.md).

## Working MVP

Radar Agent is a two-sided agentic-economy demo on
[Arc](https://docs.arc.io/):

- **Seller** — `GET /api/signals/latest` converts public Coinbase Exchange
  candles into a price-radar signal and protects it with Circle Gateway x402.
- **Buyer** — `agent/radar.mts` checks its deterministic budget, pays for the
  signal in USDC and applies an explainable decision rule. The optional
  guarded treasury rebalance through Circle App Kit is testnet-only.
- **Unavailable data** — stale or unavailable paid content is refused before settlement.
- **Reliable demo mode** — the paid endpoint can expose a clearly labelled
  sharp-drop fixture so judging is not dependent on a live market crash.

### Prototype discipline layer

The local buyer uses deterministic policy checks. These prototype controls do not establish production custody guarantees:

| Guard | What it does |
|---|---|
| **Spending cap** | Hard daily budget for signal purchases and treasury moves. Exceed → refuse before signing. |
| **Idempotency** | Every action carries a deterministic key; the same decision can never execute twice. |
| **Position safety** | Refuses to act if unexpected balances/positions exist that the agent didn't create. |
| **Circuit breaker** | Consecutive failures or anomalous signal patterns → agent halts until a manual reset. |
| **Audit trail** | Every signal purchase, decision, and settlement is logged and traceable end-to-end. |

Buyer and seller select the same network via `ARC_NETWORK=testnet|mainnet`.
The default remains testnet. Mainnet signing requires a key matching the approved `BUYER_ADDRESS` and
`--allow-mainnet`. Gateway
deposits need a separate `--allow-deposit`, and live testnet treasury transfers
need `--allow-treasury`. Mainnet treasury execution is disabled.
Every final payment quote is checked before signing; signed authorizations
reserve budget even if the HTTP response is lost.
The live feed retries once and rejects old or future-dated candles.
The seller settles only after successfully preparing a fresh response.

Circle Gateway batches small USDC payments; Arc uses USDC for gas. Deposits
and chain transactions have separate costs. No zero-fee claim is made.

## Run locally

Prerequisites: Node.js 22+, an Arc Testnet seller address, and an x402 buyer
wallet funded with testnet USDC.

```bash
npm install
cp .env.example .env.local
npm run dev
```

In a second terminal:

```bash
npm run agent
```

Run the complete decision and safety path without keys or funds:

```bash
npm run agent:dry
```

Reset an opened breaker only after a human checks the audit:

```bash
npm run agent -- --reset-breaker
```

Runtime state and the append-only audit are separated under
`agent/state/testnet/`, `agent/state/mainnet/` and `agent/state/dry-run/`, and
are ignored by git. `RADAR_STATE_DIR` can point to a dedicated durable volume.

## Arc testnet setup

1. Run `npm run generate-wallet`, then put the buyer private key in
   `.env.local`. This is testnet-only.
2. Fund the address through the Circle faucet.
3. Deposit USDC into Gateway, or set `GATEWAY_AUTO_DEPOSIT_USDC`.
4. Configure `SELLER_ADDRESS`.
5. For real treasury execution, configure the Circle API key, entity secret,
   active developer-controlled wallet address and reserve address.
6. Set `TREASURY_AVAILABLE_USDC` to the reconciled active-wallet balance used
   by the position-safety check.

For a deterministic but still x402-paid judge demo, set
`RADAR_ALLOW_DEMO_SIGNALS=true` on the seller and run:

```bash
npm run agent -- --demo-signal
```

## Decision and discipline

The default rule rebalances only when all conditions are true:

- the feed is fresh;
- signal type is `sharp_drop`;
- magnitude is at least 150 basis points;
- confidence is at least 0.90.

Every money-touching action passes:

- separate daily caps for data and treasury spending;
- replay-safe action reservation before execution;
- minimum-reserve position safety;
- a three-failure circuit breaker;
- an append-only JSONL audit trail.

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## Roadmap (hackathon checkpoints)

- [x] **Checkpoint 1 (Jul 19)** — project, team, idea
- [x] **Checkpoint 2 (Jul 26)** — architecture and discipline-layer skeleton
- [ ] **Checkpoint 3 (Aug 9)** — run the implemented MVP with funded wallets,
  capture Arc transaction hashes, deploy the seller, and record the demo
- [ ] **Demo Day (Aug 20)**

## Repo layout

```text
app/                Next.js landing page + paid signal endpoint
lib/                live signal feed, x402 wrapper, rules and discipline
agent/radar.mts      autonomous buyer + Circle App Kit executor
agent/discipline/    original Python discipline reference
tests/               deterministic rule and safety tests
docs/                architecture and checkpoint deck
```

## Status

The October Arc mainnet continuation is public at
[radar-agent-ivory.vercel.app](https://radar-agent-ivory.vercel.app).
The reviewed source is on `codex/arc-microgrants`; the main branch retains
historical testnet media and the September implementation.

Validated October 12, 2026: 59 tests, TypeScript and the production build pass.
Thirteen anonymous cloud checks pass, including fresh Coinbase data, retained
Free Upstash Redis readiness, Arc mainnet 402 quotes, funding simulation and
preview login protection. See the
[public deployment evidence](docs/deployment-public-vercel-2026-10-12.json).
No owner signature, funding transaction or paid response was used by those checks.

The wallet-confirmed pilot is enabled. Actual paid mainnet delivery, owner
receipt/CSV verification, the mainnet recording and final application submission
remain pending. The application draft is saved in DoraHacks through the team
step and is awaiting required private contact fields.

Application prose, recording script and open gates are in the
[Arc Microgrants materials](docs/submission/ARC_MICROGRANTS_APPLICATION.md).
The old testnet video and transactions are historical evidence only. The
checkpoints above record the original hackathon, not current deadlines.

## License

Original Radar Agent code is MIT licensed. The adapted Circle x402 integration
is Apache-2.0; see `NOTICE` and `LICENSE-APACHE-2.0`.

## Agent payments and receipts

Durable nonce/request claims preserve the exact response for recovery.
`/pilot` lets the approved test wallet sign a single 0.001 USDC purchase without
exporting its key. Optional Gateway funding is exactly 0.01 USDC, with an exact
approval and a 0.005 USDC gas cap per funding transaction. A read-only quote
simulates approval first; deposit simulation runs after approval confirms.
Separate buttons require owner confirmation for every transaction. Expired
quotes, wrong accounts/chains and unresolved transactions block new funding.
The API fee is paid from the deposit; automatic deposits and mainnet treasury
execution remain disabled.

`/billing` reads wallet-scoped receipts and exports CSV using a five-minute
read-only wallet signature. Gateway acceptance and independently confirmed
chain transactions are labelled separately. The buyer and recipient currently
use the same test wallet; this experiment does not establish customer revenue.

See [Agent integration](docs/AGENT_INTEGRATION.md),
[payment recovery](docs/PAYMENT_RECOVERY.md), and the
[mainnet pilot runbook](docs/PILOT_RUNBOOK.md).
Earlier October 9 deployment evidence is historical; the October 12 public
record contains the current hosting configuration and verification results.

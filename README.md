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

October 2026 Vercel continuation, prepared on `codex/arc-microgrants`.
The protected cloud build passes authenticated health, fresh Coinbase feed
and unpaid 402 checks. The public origin and real paid mainnet delivery are
not yet verified. The main branch has September durable receipt/recovery work
and historical testnet media. Its recovery state machine is now ported to
Vercel-compatible Redis; cloud database activation remains pending.

Application prose, recording script and open gates are in the
[Arc Microgrants materials](docs/submission/ARC_MICROGRANTS_APPLICATION.md).
The old testnet video and transactions are historical evidence only. The historical checkpoints
above record the original hackathon; they are not current deadlines.

## License

Original Radar Agent code is MIT licensed. The adapted Circle x402 integration
is Apache-2.0; see `NOTICE` and `LICENSE-APACHE-2.0`.

## Agent payments and receipts

The Vercel continuation includes durable nonce/request claims, exact response
replay and wallet-scoped receipts. `/pilot` lets the approved test wallet sign a
single purchase without exporting its key; `/billing` reads receipts and exports
CSV using an expiring read-only wallet signature. Payments default to disabled
until a retained database, public hosting and spending approval are ready.

See [Agent integration](docs/AGENT_INTEGRATION.md),
[payment recovery](docs/PAYMENT_RECOVERY.md), and the
[mainnet pilot runbook](docs/PILOT_RUNBOOK.md).

Validated October 9: 56 tests, TypeScript and Next.js production build pass.
Tests use synthetic payments; no paid mainnet delivery is claimed.

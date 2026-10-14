# Radar Agent

> Pay-per-query ETH/BTC market data for other agents and developers, with
> USDC spending checks, recoverable payment records and wallet-scoped billing.
> Mainnet exchange trading and treasury execution are not part of this service.

Originally built for the **Encode Club × Circle [Programmable Money Hackathon](https://www.encodeclub.com/programmes/arc-hackathon)** — Agentic Economy track, July–August 2026.
Continued for **[Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq)** in October 2026. See [the submission and deployment pack](docs/ARC_MICROGRANTS.md).

## Working MVP

Radar Agent connects a market-data seller and an agent buyer on
[Arc](https://docs.arc.io/). Browser pages provide an owner-operated pilot,
receipt inspection and reliability testing:

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
| **Spending cap** | Separate daily budgets for data purchases and optional testnet treasury moves; refuse before signing above the cap. |
| **Idempotency** | Persistent action keys and reservations block known duplicate execution; uncertain outcomes require recovery. |
| **Position safety** | Optional testnet sends require a configured reconciled balance and preserve the minimum reserve. |
| **Circuit breaker** | Consecutive failures or anomalous signal patterns → agent halts until a manual reset. |
| **Audit trail** | Local records link purchases and decisions; Gateway acceptance and independently checked chain settlement remain distinct evidence. |

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

The default rule suggests a rebalance only when all conditions are true.
Executing that suggestion requires the separately enabled testnet treasury module:

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

## Historical roadmap (July–August hackathon checkpoints)

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
docs/                current architecture, submission materials and historical deck
```

## Status

The October Arc mainnet continuation is public at
[radar-agent-ivory.vercel.app](https://radar-agent-ivory.vercel.app).
The reviewed source is on `codex/arc-microgrants`; the main branch retains
historical testnet media and the September implementation.

Historical validation baseline, October 12, 2026 (`e01709c`): 70 tests,
TypeScript, the production build and sixteen anonymous cloud checks passed,
including fresh Coinbase data, retained Free Upstash Redis readiness, Arc mainnet 402 quotes, funding simulation and
preview login protection. See the
[public deployment evidence](docs/deployment-public-vercel-2026-10-12.json).
No owner signature, funding transaction or paid response was used by those checks.

The [mainnet pilot record](docs/mainnet-pilot-2026-10-12.json) verifies the
owner's 0.01 USDC Gateway deposit, zero-allowance revoke and corrected two-wallet
purchase. Exactly 0.001 USDC bought a live ETH signal; its response digest
matches independently. Wallet-authenticated billing returned 200 and the owner
confirmed CSV export. Circle marked the transfer completed, Arc RPC confirmed
the linked batch, and the seller's Gateway credit is 0.001 USDC.

Both wallets belong to the owner. This proves functionality; independent users,
customer revenue and production readiness are not claimed. The one-query pilot
budget is spent: do not repeat a purchase or clear its reservation.

The owner completed DoraHacks submission on October 12. The page displays
Build Submitted and confirms Radar Agent is under review for Arc Microgrants.
Submission is not an award decision. A new mainnet recording has not been made;
video is optional in the application form.

Application prose, recording script and submission status are in the
[Arc Microgrants materials](docs/submission/ARC_MICROGRANTS_APPLICATION.md).
The old testnet video, checkpoint deck (`docs/deck.pdf`) and transactions are
historical evidence only. Use the October application and architecture for
the current mainnet scope; do not present the old deck as current mainnet
results. The checkpoints above record the original hackathon, not current deadlines.

## License

Original Radar Agent code is MIT licensed. The adapted Circle x402 integration
is Apache-2.0; see `NOTICE` and `LICENSE-APACHE-2.0`.

## Agent payments and receipts

Durable nonce/request claims preserve the exact response for recovery.
`/pilot` lets the approved test wallet sign a single 0.001 USDC purchase without
exporting its key. Optional Gateway funding is exactly 0.01 USDC, with an exact
approval and a 0.005 USDC gas cap per funding transaction. A read-only quote
simulates approval first; deposit simulation runs after approval confirms.
Separate buttons require owner confirmation for every transaction. Actual
broadcast calldata and gas are checked against the approved transaction.
Allowance review and a separate approve-to-zero revoke flow are available;
excessive allowances block new funding and purchase authorizations. Expired
quotes, wrong accounts/chains and unresolved transactions block new funding.
The API fee is paid from the deposit; automatic deposits and mainnet treasury
execution remain disabled.

`/billing` reads wallet-scoped receipts and exports CSV using a five-minute
read-only wallet signature. Gateway acceptance and independently confirmed
chain transactions are labelled separately. The funded buyer and recipient are separate owner-controlled wallets.
The billing receipt labels Gateway acceptance conservatively; later batch
confirmation is recorded separately in the mainnet pilot evidence.

See [Agent integration](docs/AGENT_INTEGRATION.md),
[payment recovery](docs/PAYMENT_RECOVERY.md), and the
[mainnet pilot runbook](docs/PILOT_RUNBOOK.md).
Earlier October 9 deployment evidence is historical; the October 12 public
record contains the October 12 hosting and verification snapshot, not the
current campaign totals or current full-suite test count.

The owner pilot supports one explicit recovery attempt after an authenticated
missing-receipt query. The previous request stays recorded. An atomic Redis
wallet cap limits the configured mainnet pilot buyer to one successful or uncertain
settlement across different authorizations and browsers. Rejected content before
settlement releases the cap; unknown outcomes retain it. No automatic retry or
replacement signature is created. Other buyers retain their normal API flow.

The browser pilot has separate approved buyer and seller addresses and refuses
self-transfers before signing. Buyer funding/allowance routes remain pinned to
the funded buyer, and the durable cap allows one exact 0.001 USDC payment to the
approved distinct recipient. Browser reservations bind buyer, recipient and
chain; older failed self-transfer reservations are retained, not cleared.

## Mainnet reliability validation

As of October 14, 2026, the staged 1,000-payment campaign is in progress after
owner approval. The [validation page](https://radar-agent-ivory.vercel.app/validation)
shows current reservations and the timestamp of the last reconciliation report;
accepted requests are not automatically counted as chain-verified payments.

Ten fixed amount tiers total **0.232600 USDC**, before separate funding gas.
The isolated payment-test receipt endpoint is not 1,000 market-signal purchases
or exchange trades. The earlier successful pilot is excluded from the campaign.
Both wallets belong to the owner, so these are functional reliability tests,
not customer revenue or adoption.

Gateway records attribute each payment to a batch. Arc receipts independently
verify batch success and aggregate wallet deltas; several payments can share
one chain hash. Reports separate payment verification from scenario passes
and retain observed failures. Supplemental concurrent replay of settled receipts
does not prove initial-settlement concurrency. No final 1,000-payment pass or
zero-difference conclusion is claimed while the campaign is running.

See [the runbook](docs/MAINNET_VALIDATION.md) for staged execution, bounded
funding, local signer options, replay/restart tests and complete exports.

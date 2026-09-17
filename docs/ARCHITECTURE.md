# Architecture

## September continuation and current boundaries

The following sections describe the historical **testnet prototype**, not a
production mainnet service. The source of truth for current release gates and
evidence is [ARC_MAINNET_PLAN.md](ARC_MAINNET_PLAN.md).

- `lib/network.ts` validates explicit network selection and blocks mainnet money
  movement independently of configuration. No real-funds run was authorized.
- `/api/openapi` describes the signal service for other agents; the independent
  `examples/external-agent/probe.mts` client only observes unpaid HTTP responses.
- `RADAR_ACCEPT_PAYMENTS` defaults to disabled. Only explicit `true` enables the
  testnet payment path; mainnet remains separately blocked. Staging can advertise
  discovery metadata while refusing every payment-bearing request before verification.
- Health performs a primary-first, zero-row D1 schema read. Missing/unmigrated
  storage returns 503, not a healthy binding claim; no payment records are exposed.
- Seller content is prepared before settlement, with invalid/stale content
  rejected before charging. A Gateway acceptance reference, a prepared response
  digest and an onchain verified receipt are different evidence levels.
- The buyer rechecks the quote at the signing hook, reserves signal fees before
  signing, and holds a single-host filesystem lock for the full cycle. Unknown
  fees survive UTC rollover and prevent another cycle. Multi-host coordination
  and principal/gas accounting are not claimed by this local ledger.
- The D1 seller stores a unique authorization key and a unique payer/request key,
  the exact prepared response, and atomic payment-state transitions. Accepted
  retries recover the original bytes; pending/unknown attempts never resettle.
  D1 binding, migrations, cloud testing and operator reconciliation are required.
- Paid HTTP refuses redirects, pins the seller, enforces a timeout and body size,
  checks response digest/correlation, and validates signal fields and freshness.
- Mainnet RPC/contract/SDK checks do not verify a Circle custody account's send
  capability. Actual balances, gas limits, final receipts and delivery evidence
  must be reconciled before the service can be described as production-ready.

## Design goals

1. **Real autonomy** — the agent decides *when to spend money* (buy a signal) and *when to move money* (rebalance), based on explainable rules tied to real market signals. Not an LLM relaying human commands.
2. **Safety before cleverness** — every fund-touching action passes the discipline layer. The agent should be boring and auditable, because it holds a wallet.
3. **Maximal reuse of the Circle stack** — the x402/nanopayments flow, wallets, and treasury actions all use official Circle components. Our own code is the decision logic and the discipline layer.

## Components

### 1. Seller: paywalled Signal API

Implemented as a Next.js route using the official
[circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments)
Circle Gateway verification and settlement flow.

- Endpoint `GET /api/signals/latest?symbol=ETH-USD` converts public Coinbase
  Exchange one-minute candles into the production price-radar format:

```json
{
  "signal_id": "pr-2026-07-22-000123",
  "ts": "2026-07-22T09:14:03Z",
  "type": "sharp_drop",
  "symbol": "ETH-USD",
  "magnitude_bps": -180,
  "window_s": 120,
  "confidence": 0.92
}
```

- Unpaid request → HTTP 402 with payment requirements.
- Paid request → EIP-3009 payment authorization verified against Circle
  Gateway, response served, payment queued for batch on-chain settlement.
- Live-feed failure → an explicit stale, non-actionable signal. Treasury
  movement is forbidden for stale data.

### 2. Buyer: Radar Agent

TypeScript (`agent/radar.mts`). Loop:

```
wake → discipline.preflight()            # position safety, budget remaining, breaker state
     → decide whether a signal purchase is warranted (schedule + market context)
     → pay via x402 nanopayment → receive signal
     → decision rules (explainable):
         e.g. sharp_drop ≥ 150bps & confidence ≥ 0.9 → shift 20% treasury USDC → reserve vault
     → discipline.authorize(action)      # cap check + idempotency key
     → execute via App Kit Send on Arc testnet
     → audit.log(signal, decision, tx)   # end-to-end traceability
     → settlement/balance reconciliation remains a production release gate
```

### 3. Discipline layer (`lib/discipline.ts`)

Ported patterns from production trading bots:

- `SpendingCap` — separate daily budgets for data purchases vs. treasury moves; hard refuse on breach.
- `IdempotencyGuard` — deterministic action keys (date + signal_id + action type); persisted; replay-safe.
- `PositionSafety` — checks the configured balance and reserve. Independent
  live balance verification is not implemented by this check itself.
- `CircuitBreaker` — N consecutive failures → halt, require human reset.
- `AuditLog` — local append-only JSONL; a Gateway reference is not a tx hash.

### 4. Treasury actions

Circle App Kit Send against Arc testnet. The current MVP action set is
deliberately small:

- `rebalance_to_reserve(amount)` — move a capped amount of USDC between the
  developer-controlled active and reserve wallets.

## Trust & failure model

- Agent keys live in env, never in the repo. Testnet only for the hackathon.
- The seller cannot drain the buyer: nanopayment authorizations are amount-bounded per query.
- Signal fee reservations are persisted before signing; unknown outcomes retain
  their reservation. Reconciliation tooling and gas/principal accounting remain
  unfinished; mainnet execution is blocked.
- Unknown settlement must not be blindly repaid. Exact accepted-response recovery
  is implemented; unknown-state resolution and external alerting are not automatic.

## Judging-criteria mapping

| Criterion | Where |
|---|---|
| Clear decision logic tied to real signals | `lib/decision.ts` + Coinbase candle signal |
| Autonomous spending / settlement in USDC | x402 signal purchases + App Kits treasury actions |
| Agent Stack usage | wallet + payment wiring |
| Nanopayments / App Kits usage | seller paywall + treasury execution |
| Why Arc | sub-cent per-query payments only economical with USDC gas + sub-second settlement |

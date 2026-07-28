# Architecture

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
     → verify settlement, reconcile balances
```

### 3. Discipline layer (`lib/discipline.ts`)

Ported patterns from production trading bots:

- `SpendingCap` — separate daily budgets for data purchases vs. treasury moves; hard refuse on breach.
- `IdempotencyGuard` — deterministic action keys (date + signal_id + action type); persisted; replay-safe.
- `PositionSafety` — requires a reconciled active-wallet balance and preserves
  a configured minimum reserve before any App Kit send.
- `CircuitBreaker` — N consecutive failures or anomalous signal rate → halt, require human reset.
- `AuditLog` — append-only JSONL; every entry links signal → decision → tx hash.

### 4. Treasury actions

Circle App Kit Send against Arc testnet. The current MVP action set is
deliberately small:

- `rebalance_to_reserve(amount)` — move a capped amount of USDC between the
  developer-controlled active and reserve wallets.

## Trust & failure model

- Agent keys live in env, never in the repo. Testnet only for the hackathon.
- The seller cannot drain the buyer: nanopayment authorizations are amount-bounded per query.
- The agent cannot drain itself: caps are enforced locally *before* signing anything.
- Every failure path ends in either a safe retry (bounded) or a halted agent + human alert — never a silent partial state.

## Judging-criteria mapping

| Criterion | Where |
|---|---|
| Clear decision logic tied to real signals | `lib/decision.ts` + Coinbase candle signal |
| Autonomous spending / settlement in USDC | x402 signal purchases + App Kits treasury actions |
| Agent Stack usage | wallet + payment wiring |
| Nanopayments / App Kits usage | seller paywall + treasury execution |
| Why Arc | sub-cent per-query payments only economical with USDC gas + sub-second settlement |

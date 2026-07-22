# Radar Agent

> An autonomous agent that buys real-time market signals via USDC nanopayments and manages a USDC treasury on Arc — with hard-coded risk discipline learned from running production trading bots.

Built for the **Encode Club × Circle [Programmable Money Hackathon](https://www.encodeclub.com/programmes/arc-hackathon)** — Agentic Economy track. July–August 2026.

## The idea

Most "AI agent + payments" demos are wrappers: an LLM that calls a payment API when a human tells it to. Radar Agent is a two-sided demo of an actual agentic economy on [Arc](https://docs.arc.io/), Circle's stablecoin-native L1:

- **Sell side** — a real market-signal feed (price alerts in the format of a production monitoring pipeline) exposed as an **x402-paywalled API**. Any agent can pay per query in USDC via [Circle Nanopayments](https://github.com/circlefin/arc-nanopayments) — sub-cent payments, verified in under a second, batch-settled on-chain.
- **Buy side** — an autonomous agent that holds its own wallet, decides *which signals are worth paying for*, pays for them in USDC, and acts on them: rebalancing a USDC treasury and settling payments through Circle App Kits. No human in the loop.

### What makes it not-a-wrapper: the discipline layer

Every action the agent takes passes through a hard-coded discipline layer — patterns we already run in production trading bots, ported to Arc:

| Guard | What it does |
|---|---|
| **Spending cap** | Hard daily budget for signal purchases and treasury moves. Exceed → refuse + alert. |
| **Idempotency** | Every action carries a deterministic key; the same decision can never execute twice. |
| **Position safety** | Refuses to act if unexpected balances/positions exist that the agent didn't create. |
| **Circuit breaker** | Consecutive failures or anomalous signal patterns → agent halts and pages a human. |
| **Audit trail** | Every signal purchase, decision, and settlement is logged and traceable end-to-end. |

Arc's USDC-denominated gas and sub-second settlement are what make this viable: an agent paying $0.001 per signal query only works when fees and latency are near zero.

## Architecture

```
┌─ Seller ─────────────────────┐        ┌─ Buyer: Radar Agent ─────────────────┐
│ Signal API (x402 paywall)    │        │ 1. pay USDC nanopayment per signal   │
│ real price-alert feed format │◄───────│ 2. decision logic (rules, explainable)│
│ per-query USDC micropayment  │  x402  │ 3. execute: App Kits swap / transfer │
│ Gateway verify → batch settle│        │ 4. discipline layer (see above)      │
└──────────────────────────────┘        │ 5. audit log → dashboard             │
                                        └──────────────── Arc Testnet ────────┘
```

## Stack

- **Arc Testnet** — EVM-compatible, USDC as native gas
- **[circlefin/arc-nanopayments](https://github.com/circlefin/arc-nanopayments)** — x402 buyer/seller starter kit (LangChain agent + Next.js seller)
- **Circle Agent Stack** — wallet + payment wiring for the agent
- **Circle App Kits** — Send / Swap SDKs for treasury actions
- **Circle Wallets** — developer-controlled wallet for the agent

## Roadmap (hackathon checkpoints)

- [x] **Checkpoint 1 (Jul 19)** — project, team, idea
- [ ] **Checkpoint 2 (Jul 26)** — this repo: architecture, discipline-layer skeleton, x402 payment flow running on Arc testnet
- [ ] **Checkpoint 3 (Aug 9)** — functional MVP on Arc testnet: live signal feed → autonomous purchase → treasury rebalance, dashboard, 3-min demo video, deck
- [ ] **Demo Day (Aug 20)**

## Repo layout

```
agent/              buyer agent (Python)
  discipline/       spending cap, idempotency, circuit breaker, audit log
  signals/          signal schema + client for the paywalled API
seller/             x402-paywalled signal API (adapted from arc-nanopayments)
docs/               architecture notes
```

## Status

Week 2 of 4. Environment + skeleton phase — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current design and [Roadmap](#roadmap-hackathon-checkpoints) for what lands when.

## License

MIT

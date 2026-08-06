# Radar Agent

> An autonomous agent that buys real-time market signals via USDC
> nanopayments and manages a USDC treasury on Arc, with hard-coded risk
> discipline learned from production trading bots.

Built for the **Encode Club × Circle [Programmable Money Hackathon](https://www.encodeclub.com/programmes/arc-hackathon)** — Agentic Economy track. July–August 2026.

## Final submission

- **Live demo:** <https://radar-agent-arc-2026.chrischang2026.chatgpt.site>
- **Demo video:** <https://radar-agent-arc-2026.chrischang2026.chatgpt.site/demo>
- **Presentation:** <https://github.com/CrisChang/radar-agent/blob/main/docs/deck.pdf>
- **Arc Testnet receipt:** <https://testnet.arcscan.app/tx/0xb552e86788532a48013355c5165e68bd50b56a24e0dd6ec2a5d28b005e687726>

The public demo exposes no buyer private key or Circle custody secret. It lets
judges verify the deployed x402 payment boundary, replay the recorded execution
proof, watch the final video and inspect the successful Arc receipt.

## Working MVP

Radar Agent is a two-sided agentic-economy demo on
[Arc](https://docs.arc.io/):

- **Seller** — `GET /api/signals/latest` converts public Coinbase Exchange
  candles into a price-radar signal and protects it with Circle Gateway x402.
- **Buyer** — `agent/radar.mts` checks its deterministic budget, pays for the
  signal in USDC, applies an explainable decision rule, and sends a guarded
  treasury rebalance through Circle App Kit.
- **Safe fallback** — a stale or unavailable feed always produces `hold`.
- **Reliable demo mode** — the paid endpoint can expose a clearly labelled
  sharp-drop fixture so judging is not dependent on a live market crash.

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

Runtime state and the append-only audit are written under `agent/state/` and
are ignored by git.

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

The deployed judge experience is deliberately non-custodial. It verifies that
the public seller advertises a Circle Gateway x402 requirement and exposes a
read-only proof endpoint. The already verified treasury transaction is replayed
for inspection instead of broadcasting another transfer from a public button.

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
- [x] **Checkpoint 3 (Aug 10)** — funded-wallet execution, public Arc receipt,
  deployed x402 seller, public proof replay, final video and deck
- [ ] **Demo Day (Aug 20)**

## Repo layout

```text
app/                Next.js landing page + paid signal endpoint
lib/                live signal feed, x402 wrapper, rules and discipline
agent/radar.mts      autonomous buyer + Circle App Kit executor
agent/discipline/    original Python discipline reference
tests/               deterministic rule and safety tests
docs/                architecture and checkpoint deck
public/demo/         compressed final-submission video
```

## Status

Final submission ready. The complete path has purchased a $0.001 x402 signal,
made an explainable decision, passed deterministic custody guards and settled a
1 USDC treasury action on Arc Testnet. The public deployment, video, deck,
source and ArcScan receipt are linked above.

## License

Original Radar Agent code is MIT licensed. The adapted Circle x402 integration
is Apache-2.0; see `NOTICE` and `LICENSE-APACHE-2.0`.

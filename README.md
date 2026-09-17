# Radar Agent

> Structured market signals for other agents, with USDC per-request payments,
> explicit delivery evidence and guarded treasury experiments on Arc.
> Current execution is **testnet-only**; mainnet compatibility has been checked,
> but production payments and grant/marketplace submissions are not enabled.

## September 2026 continuation

We are continuing the existing Arc project in this order:

1. **Read-only mainnet compatibility — checked.** Arc RPC identity/recent block,
   USDC/Gateway contract presence and token decimals, Gateway supported kinds,
   and updated SDK chain definitions. This is not a security audit or a paid test.
2. **External-agent integration — in progress.** `/api/openapi`, an independent
   no-wallet HTTP probe, response digests, explicit unknown-payment handling,
   durable D1 request/response records, pending-budget reservations and 47
   regression tests. No third-party adoption or new paid delivery claimed.
3. **Microgrants / Agent Marketplace — not submitted.** Mainnet money movement
   stays code-blocked pending durable accounting/recovery, real delivery tests,
   confirmed wallet identities and an owner-approved total spending budget.

See [launch plan, evidence and application gates](docs/ARC_MAINNET_PLAN.md) and
the [external-agent example](examples/external-agent/README.md).
The [staging and pilot runbook](docs/STAGING_AND_PILOT.md) lists remaining work.

September 17: the owner approved a separate testnet Worker/D1 deployment, but
Cloudflare login is currently required (the OAuth attempt timed out). No new
cloud resources have been created. The staging build is ready and locally tested:
payment acceptance defaults to disabled, and health performs a real schema read.
`RADAR_ACCEPT_PAYMENTS=true` is a separate paid-pilot opt-in, not deployment consent.

```bash
npm run check:mainnet   # public read-only probes; no keys, signing or payments
npm run build && npm run check:worker # isolated local Worker + D1; outbound HTTP disabled
npm run build:staging  # disables Vite dotenv + Wrangler dotenv dev-vars loading
npm run agent:probe -- --url http://127.0.0.1:3000 --network testnet --save
```

Probe reports under `docs/evidence/` explicitly distinguish unpaid HTTP checks
from accepted payments, delivered content and independently verified settlement.
An earlier connectivity failure is retained alongside the successful mainnet rerun.

Built for the **Encode Club × Circle [Programmable Money Hackathon](https://www.encodeclub.com/programmes/arc-hackathon)** — Agentic Economy track. July–August 2026.

## Historical hackathon submission (Arc Testnet)

- **Live demo:** <https://radar-agent-arc-2026.chrischang2026.workers.dev>
- **Demo video:** <https://radar-agent-arc-2026.chrischang2026.workers.dev/demo>
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

### Prototype discipline layer

The prototype uses deterministic policy checks. These are local, single-process
controls, not a production custody guarantee:

| Guard | What it does |
|---|---|
| **Spending cap** | Signal fees are reserved durably before signing. Pending/unknown fees still consume budget after restart or UTC rollover. Treasury/gas accounting remains a separate release gate. |
| **Idempotency** | Persistent keys refuse repeat treasury actions in the single-process CLI. Distributed payment recovery is still required. |
| **Reserve check** | Checks a configured available balance and minimum reserve. Independent live balance reconciliation is still required. |
| **Circuit breaker** | Three consecutive failures halt the CLI until a manual reset. No external paging integration is claimed. |
| **Audit trail** | D1 seller records and exact response recovery; local buyer audit includes request, nonce and received digest. Gateway references are not automatically onchain receipts. |

The CLI locks its state directory for the entire cycle. Unknown payments block
future cycles until reconciled; a breaker reset does not release reserved money.
This is single-host protection, not distributed coordination between multiple buyers.

Circle Gateway batches sub-cent USDC payments; Arc uses USDC for gas. Gateway
deposits, withdrawals and treasury sends still need explicit cost accounting.
No zero-total-cost or measured mainnet economics claim is made here.

## Run locally

Prerequisites: Node.js 22.22+ for the current local verification tools.
Unpaid previews and automated tests do not need a wallet.

```bash
npm install
cp .env.example .env.local
npm run dev
```

For unpaid integration checks in a second terminal:

```bash
npm run agent:probe -- --url http://localhost:3000 --network testnet
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
are ignored by git. Dry runs use `agent/state/dry-run/` and do not mutate the
existing real testnet ledger. Do not delete or reset old state during migration.

## Arc testnet setup

1. Run `npm run generate-wallet`, then put the buyer private key in
   `.env.local`. This is testnet-only.
2. Fund the address through the Circle faucet.
3. Fund Gateway separately with explicit approval. Automatic deposits have been
   removed; service fees, funding gas and any principal must be budgeted separately.
4. Configure `SELLER_ADDRESS` on the server and independently pin
   `EXPECTED_SELLER_ADDRESS` in the buyer. Paid serving requires `RADAR_PAYMENTS`
   plus migration `0001`; the Node-only preview supports unpaid discovery, not paid serving.
5. For real treasury execution, configure the Circle API key, entity secret,
   active developer-controlled wallet address and reserve address.
6. Set `TREASURY_AVAILABLE_USDC` to the reconciled active-wallet balance used
   by the position-safety check. This is a supplied value, not a live RPC check.

Normal `npm run agent` now stops after signal purchase/validation. The historical
testnet treasury experiment requires `--execute-treasury`; live balance/gas and
receipt reconciliation are unfinished, so do not use it as production evidence.

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

Invalid request parameters are rejected before demanding payment. After payment
verification, the seller prepares fresh content **before** accepting settlement;
stale/unavailable data returns 503 without a new settlement attempt. If settlement
times out, a 502 response marks the payment unknown and unsafe to repay blindly.
Cloud persistence validation and unknown-settlement reconciliation remain mainnet release blockers.

Exact accepted retries recover the saved response without a new settlement.
Changed request terms or authorization return 409. Unknown/settling records never
auto-retry payment. Their final disposition still needs operator reconciliation.
The guarded deploy command refuses the old config until durable storage is wired;
do not overwrite the historical public site to test this release.

## Historical roadmap (hackathon checkpoints)

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
examples/           independent no-payment agent integration probe
scripts/            read-only mainnet diagnostics and testnet wallet setup
agent/discipline/    original Python discipline reference
tests/               deterministic rule and safety tests
docs/                architecture and checkpoint deck
public/demo/         compressed final-submission video
```

## Status

The historical demo purchased a $0.001 x402 signal and settled a 1 USDC treasury
action on **Arc Testnet**, using a labelled sharp-drop fixture. Its video and
receipt are preserved above. The September continuation is being pushed to this
repository but is not publicly deployed; the old site is not evidence of these new features.
Mainnet execution, external paid-client evidence and ecosystem applications are
pending the launch gates, not complete.

## License

Original Radar Agent code is MIT licensed. The adapted Circle x402 integration
is Apache-2.0; see `NOTICE` and `LICENSE-APACHE-2.0`.

# Radar Agent

**Paid API calls for agents, with spending limits, recoverable receipts and USDC reconciliation on Arc.**

One logical request connects the quote, authorization, delivered response, retries and settlement evidence.
The working service uses a 0.001 USDC ETH observation as its example. The product focus is API-payment accounting and recovery.

[Live app](https://radar-agent-ivory.vercel.app) · [Agent integration](https://radar-agent-ivory.vercel.app/integrate) · [Mainnet evidence](https://radar-agent-ivory.vercel.app/evidence) · [OpenAPI](https://radar-agent-ivory.vercel.app/api/openapi)

Current source: [`codex/arc-microgrants`](https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants).
The main branch retains the earlier hackathon prototype.

## One entry point for an agent

Start without a wallet or spending:

```bash
curl -i "https://radar-agent-ivory.vercel.app/api/signals/latest?symbol=ETH-USD"
```

HTTP 402 is the expected quote. The agent checks Arc 5042, USDC, the expected seller and the exact amount before signing.
Use a stable `x-radar-request-id` for one logical purchase; retain the original authorization before submitting it in `payment-signature`.

The canonical reference command is:

```bash
npm ci
npm run agent:call
```

Default mode only probes readiness and the quote. To run one explicitly approved purchase, configure your own local wallet and limits in `.env.mainnet.local`, then:

```bash
npm run agent:call -- --execute
```

The reference client retains one logical call and its exact authorization on disk. Repeating the command resumes that call; an explicit `--request-id <UUID>` selects another call under the daily budget. It does not reopen the project's spent pilot. There are no automatic deposits or mainnet treasury transfers. Unknown outcomes retain the budget reservation and stop execution. Keep keys and reusable authorizations private.

See [the complete integration contract](docs/AGENT_INTEGRATION.md) for configuration, receipt reads and original-authorization recovery.

## What is accounted for

| Stage | Retained record | What it establishes |
| --- | --- | --- |
| Quote and budget | Atomic amount, network, recipient, local spend reservation | Expected spend before signing |
| Authorization | Logical request ID, original nonce and authorization in the private client journal | One purchase identity across retries |
| Delivery | Saved response, SHA-256, Gateway acceptance reference | Matching delivered bytes and an accepted payment |
| Recovery | Attempts, statuses, response-loss/restart evidence, original receipt | Request overhead and recovery without assuming a timeout is unpaid |
| Settlement | Gateway transfer attribution and independently decoded Arc batch wallet deltas | Actual charge and aggregate onchain movement |

Wallet-scoped receipts use a five-minute read signature and support CSV export. Server storage retains nonce/request claims and responses without storing reusable payment signatures. Private keys stay with the buyer.

## Mainnet validation

The dated public reconciliation on October 14, 2026 records:

| Measurement | Observed |
| --- | --- |
| Unique payments chain verified | 1,000 / 1,000 |
| Payment principal | 0.232600 USDC |
| Amount tiers | Ten tiers, 100 payments each, from 0.000001 to 0.001000 USDC |
| Shared Arc batches | 32 |
| Maximum aggregate-wallet amount difference per batch | 0 USDC atomic units; tolerance is exactly zero |
| Payment and scenario evidence | 993 / 1,000; seven concurrent-overlap cases remain open in this snapshot |

The [live evidence page](https://radar-agent-ivory.vercel.app/evidence) always shows the latest saved reconciliation and its timestamp. The public JSON/CSV includes all 1,000 rows, scenario status, response hashes and batch links. A stale or missing report is never converted into a pass.

| Scenario | Planned | Snapshot passes |
| --- | --- | --- |
| Sequential calls | 600 | 600 |
| Cross-session continuation | 200 | 200 |
| Serial original-authorization replay | 100 | 100 |
| Concurrent original-authorization replay | 50 | 43 |
| Controlled response loss | 25 | 25 |
| Real client restart | 25 | 25 |

The experiment uses isolated payment-test receipts between two owner-controlled wallets. It is separate from the earlier live 0.001 USDC ETH API purchase. It does not establish independent customers or revenue. Gateway supplies per-payment attribution; Arc independently proves the shared batches and aggregate wallet changes. Supplemental concurrency after settlement covers cached receipt retrieval, not an initial settlement race. The owner explicitly accelerated the remaining schedule, so this is not completion of the original 24-hour plan.

The complete October 15 audit individually matched all 1,000 authenticated server bills to Gateway by nonce and acceptance reference, compared 900 original local authorizations and re-read all 32 Arc batches. All 5,507 exported events were inspected: 1,241 paired HTTP attempts (1,204 × 200, 5 × 402, 32 × 409), with no unmatched starts. Server handler intervals were p50 181 ms and p95 262 ms; these exclude client networking, quotes and signing. Observed gas for the 32 shared batches totals 0.075440811423012694 native USDC, paid by their submitters and not allocated to this campaign.

**Zero principal variance is not zero cost.** Funding/approval gas, shared-batch gas, provider fees, hosting and API costs are separate categories. Unmeasured values are shown as unknown. Server-observed timings exclude client networking and signing.

[Method and limits](docs/MAINNET_VALIDATION.md) · [Independent audit and its scope](docs/MAINNET_AUDIT.md) · [Live API baseline](docs/mainnet-pilot-2026-10-12.json)

## Run and verify

Node.js 22+ is required. For development, use Arc Testnet and your own separately funded test wallet:

```bash
cp .env.example .env.local
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```

Production is hosted on Vercel with durable Upstash Redis. Missing storage fails closed. Operator-only pilot, funding and validation controls are excluded from public navigation and search indexing; their existing URLs remain available to the owner. Hiding a page is not authentication.

Validation for this revision: **152 tests passed**, TypeScript, production build and **22 anonymous production checks** passed ([deployment check record](docs/focused-review-2026-10-15.json)); the canonical no-payment client obtained a real 0.001 USDC Arc quote. The new focused client's paid/recovery behavior was tested with synthetic fixtures; no additional mainnet purchase was made for this revision. Private call journals live under `~/.radar-agent-api/`.

## Source map

```text
app/                    focused homepage, integration and read-only evidence pages
app/api/signals/latest/  working paid-call example
lib/                    x402, persistent receipts, recovery and reconciliation
examples/external-agent/call.mts  canonical agent entry point
agent/radar.mts          existing budgeted buyer; historical decision module
scripts/audit-mainnet.mts read-only audit of owner exports, Gateway and Arc
docs/                   methodology, audit and submission materials
```

## Submission

The project continues earlier Encode Club × Circle work for [Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq).
The owner submitted Radar Agent on October 12; the [DoraHacks project](https://dorahacks.io/build/49626) remains under review. No award or funding is claimed.
See [the current submission pack](docs/ARC_MICROGRANTS.md).

The earlier testnet treasury/decision demo and historical deck remain available for provenance. They are outside the current agent API-payment product focus.

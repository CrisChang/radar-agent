# Radar Agent application record and current public copy

Updated October 15, 2026 (Asia/Shanghai). The owner submitted October 12; DoraHacks shows Under Review. This records the current focused public copy and measured evidence, not selection or funding.

## Project fields

| Field | Value |
| --- | --- |
| Name | Radar Agent |
| One line | Agent API payments and accounting with recoverable USDC receipts on Arc |
| Public app | https://radar-agent-ivory.vercel.app |
| Agent integration | https://radar-agent-ivory.vercel.app/integrate |
| Evidence | https://radar-agent-ivory.vercel.app/evidence |
| Source | https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants |
| Public build | https://dorahacks.io/build/49626 |
| Network | Arc Mainnet 5042 |
| Working API example | One ETH observation, 0.001 USDC |
| Prior Arc deployment | Testnet, owner-confirmed |
| Prior Circle/Arc project funding or prizes | None, owner-confirmed |

## Short introduction — saved public Vision (217 characters)

Agent API payments with exact USDC quotes, spending limits, recoverable responses and retry accounting on Arc. Trace one request through payment, receipt and settlement. Live API and 1,000 reconciled mainnet payments.

## Detailed public description — saved October 15

### Agent API payments and accounting

Radar Agent connects one paid API call to its quote, spending limits, original USDC authorization, saved response, retry history and Arc settlement evidence. An agent can recover a lost response without creating a fresh payment identity.

The working API example returns a timestamped ETH observation for 0.001 USDC. Market data is demonstration content; the core product is understanding what an agent call spent, how it recovered and whether settlement matches the ledger.

### Try one integration path

- [Agent integration and runnable client](https://radar-agent-ivory.vercel.app/integrate)
- [Read-only mainnet evidence, 1,000 rows and batch links](https://radar-agent-ivory.vercel.app/evidence)
- [Public source and methodology](https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants)

The seller runs on Vercel with durable Redis. Circle Gateway accepts exact USDC authorizations and later settles them in shared Arc Mainnet batches (chain 5042). The reference buyer checks the quote, reserves its budget and saves the original authorization before submission. Unknown outcomes retain their budget; retries reuse that authorization. Authenticated receipts support CSV export. The buyer's key stays local.

### 1,000 real mainnet payments, reconciled

The October 15, 2026 audit individually matched all 1,000 owner-exported billing records to completed Gateway transfers and independently re-read all 32 shared Arc batches. Another 900 local authorization journals were compared. Ten amount tiers contain 100 payments each, totaling exactly 0.232600 USDC. Expected and actual principal match; the maximum batch wallet difference is 0 atomic units, with zero tolerance. No duplicate provider charges were found for the campaign authorizations.

The six scenarios cover sequential calls (600), separate sessions (200), serial retries (100), concurrent retries (50), controlled lost acknowledgements (25) and client restarts (25). Payments completed: 1,000/1,000. Payment-and-scenario evidence passed: 993/1,000. Seven concurrent-overlap cases remain open despite completed payments. The evidence page retains failures and separates these outcomes.

The exported event history contains 1,241 HTTP attempts: 1,204 returned 200, five returned 402 and 32 returned 409. Extra attempts are request overhead, not additional charges. Server-observed handler intervals have p50 181 ms and p95 262 ms; these exclude client networking, quotes and signing and are not end-to-end latency benchmarks.

### What this evidence establishes

This campaign uses isolated payment-test receipts, separate from the earlier live 0.001 USDC ETH API purchase. Both wallets belong to the owner, so the experiment does not establish independent customers or revenue. Per-payment attribution relies on Gateway; Arc independently verifies batch execution and aggregate wallet changes. Multiple payments share each batch hash. Expected test-response bytes were reconstructed and compared with saved digests.

Supplemental concurrent reads validate retrieval after settlement, not an initial-settlement race. An owner-approved accelerated schedule replaced the original 24-hour plan. Zero principal variance does not imply zero total cost: funding gas, provider fees and infrastructure costs remain separate. Shared-batch network gas is not allocated to this campaign or to each caller.

This is a working mainnet prototype for agent developers. Historical testnet treasury demonstrations remain separate. The owner confirms no previous project prizes or funding, including Circle or Arc funding. No trading profit or production-readiness claim is made.

[Live app](https://radar-agent-ivory.vercel.app) · [Integrate](https://radar-agent-ivory.vercel.app/integrate) · [Evidence](https://radar-agent-ivory.vercel.app/evidence)

## 中文定位

Radar Agent 聚焦 Agent 付费 API 调用的账务与恢复：报价和预算、原授权、请求与响应摘要、失败重试、Gateway 付款和 Arc 批次核验，均按同一逻辑请求串联。ETH 行情是现有演示内容，主方向是看清调用花了多少、重试了多少，以及实际结算是否与预期一致。

1,000 笔主网付款均已链上核验，合计 0.232600 USDC、32 个共享批次，批次内钱包金额偏差为零。当前场景证据快照通过 993/1,000，七个并发重叠场景仍待证据；实际付款已完成。资金均来自本人控制钱包，补测读取及快速时间变更均单独披露。

## Application handling

The authenticated application page remains Under Review; management fields are locked. The public Build short profile and rich-text details above were saved successfully, reloaded and visually verified on October 15. Original application and private contacts remain intact. Do not withdraw and resubmit, accept new legal terms or message the organizer without a specific need and authorization. Private contacts are excluded from source.

Official requirements and deadline: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq. Deadline October 15, 2026, 11:59 Asia/Shanghai. Optional mainnet video is not recorded. Historical testnet video must not be presented as current mainnet evidence.

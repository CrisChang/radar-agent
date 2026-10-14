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

## Short introduction

Radar Agent helps agents account for paid API calls: exact USDC quotes, spending limits, recoverable responses, retry records and Arc settlement evidence. One request identity connects the payment and receipt. A working ETH data endpoint and a 1,000-payment mainnet experiment demonstrate the path.

## Detailed public description

### One focus: paid agent calls with a verifiable accounting trail

An agent can lose a response even after its payment was accepted. Retrying with a fresh authorization can spend again, while treating HTTP 200 as chain confirmation can make a ledger misleading. Radar Agent keeps one logical request connected to its quote, original USDC authorization, saved response, attempts and settlement evidence.

The working API example is a timestamped ETH observation for 0.001 USDC. The agent validates the quote and spending policy before signing, reserves its budget, verifies the returned bytes and retains uncertain outcomes. Wallet-scoped receipts support read-only authentication and CSV export. The core product is paid-call accounting and recovery; the market observation is demonstration content.

### Live product and integration

- App: https://radar-agent-ivory.vercel.app
- One agent entry: https://radar-agent-ivory.vercel.app/integrate
- Read-only evidence: https://radar-agent-ivory.vercel.app/evidence
- Source: https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants

The seller runs on Vercel with durable Redis. Circle Gateway accepts exact USDC authorizations and subsequently settles payments in Arc batches. The buyer retains its key locally. No automatic funding or mainnet treasury execution occurs in this path.

### Measured mainnet evidence

The October 14 reconciliation verifies 1,000 unique payments across ten amount tiers, totaling 0.232600 USDC and linked to 32 shared Arc batch hashes. All payments are completed and the maximum aggregate-wallet amount difference per batch is zero atomic units. The acceptance tolerance is exactly zero.

The campaign covers 600 sequential payments, 200 cross-session payments, 100 serial retries, 50 concurrent retries, 25 controlled lost responses and 25 real client restarts. The current dated snapshot has 993 of 1,000 payment-and-scenario passes. Seven concurrent-overlap cases remain open even though their payments completed. The evidence page always shows the latest saved report and timestamp.

This is a controlled payment-test experiment, separate from the earlier real 0.001 USDC ETH API delivery. Both wallets belong to the owner; these payments do not establish independent customers or revenue. Per-payment attribution relies on Gateway, while Arc independently verifies shared-batch execution and aggregate wallet changes. Several payments share each batch hash. Supplemental concurrent reads after settlement are labelled and do not prove an initial-settlement race.

The owner explicitly amended the remaining schedule to accelerated execution. The original 24-hour schedule was not completed. Request overhead, server-observed timing, payment principal and network gas are distinct measurements. Funding gas, provider fees and infrastructure costs are not inferred as zero from a zero-principal-variance result.

### Current scope

The project is a working mainnet prototype for agent developers. Its proof is the runnable API, recoverable accounting path and inspectable mainnet records. The older testnet treasury demo remains historical context. No trading profit, production readiness, independent adoption or previous funding is claimed.

## 中文定位

Radar Agent 聚焦 Agent 付费 API 调用的账务与恢复：报价和预算、原授权、请求与响应摘要、失败重试、Gateway 付款和 Arc 批次核验，均按同一逻辑请求串联。ETH 行情是现有演示内容，主方向是看清调用花了多少、重试了多少，以及实际结算是否与预期一致。

1,000 笔主网付款均已链上核验，合计 0.232600 USDC、32 个共享批次，批次内钱包金额偏差为零。当前场景证据快照通过 993/1,000，七个并发重叠场景仍待证据；实际付款已完成。资金均来自本人控制钱包，补测读取及快速时间变更均单独披露。

## Application handling

The authenticated application page remains Under Review; management fields are locked. Update the public Build text through Edit Build, keeping the original application and private contacts intact. Do not withdraw and resubmit, accept new legal terms or message the organizer without a specific need and authorization. Private contacts are excluded from source.

Official requirements and deadline: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq. Deadline October 15, 2026, 11:59 Asia/Shanghai. Optional mainnet video is not recorded. Historical testnet video must not be presented as current mainnet evidence.

# Radar Agent Arc Microgrants application record

Updated October 14, 2026. The October 12 owner-operated Arc Mainnet paid-query
baseline passed. A separate 1,000-payment reliability campaign is in progress.
The owner submitted on October 12; DoraHacks records the application as under
review. Submission does not establish selection or funding.

## Project fields

| Field | Value |
| --- | --- |
| Project name | Radar Agent |
| One line description | USDC pay per query market signals with a buyer that enforces spending limits on Arc |
| Source code | https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants |
| Builder profile | https://github.com/CrisChang |
| Public deployment | https://radar-agent-ivory.vercel.app |
| Network | Arc Mainnet, chain 5042 |
| Service price | 0.001 USDC per ETH/BTC market-data query |
| Reliability report | https://radar-agent-ivory.vercel.app/validation — separate payment-test receipts, campaign in progress |
| API-fee batch evidence | https://explorer.arc.io/tx/0xc407227af427e96af16521bff611e6719c68e6e26e6de9eefae8ee642bd7ed41 |
| Funding evidence | https://explorer.arc.io/tx/0xa0286660f1881b42b2679b9e47ae06dfa6e393129a94c71f0fe8654f3a8d9b30 — 0.01 USDC deposit, separate from API-fee settlement |
| Prior Arc deployment | Testnet, confirmed by the owner |
| Prior Circle or Arc funding/prizes for this project | None, confirmed by the owner October 8, 2026 |
| Mainnet video | Not recorded; optional in the official form |

## Short description in English

Radar Agent sells timestamped ETH/BTC market observations to other agents for
0.001 USDC per query. A buyer enforces spending limits before signing,
validates delivery and keeps recoverable, wallet-scoped receipts with CSV export.

## Detailed description in English

Radar Agent is an agent commerce prototype. Its Next.js seller converts public
Coinbase Exchange candles into structured observations and advertises a
0.001 USDC price through Circle Gateway x402. The local buyer validates the
network, asset, recipient, approved wallet and budget before signing. It applies
deterministic rules to the returned signal and retains a local decision audit.
The hosted wallet pilot demonstrates bounded payment, delivery verification,
durable receipt recovery and wallet-authenticated billing. Mainnet treasury
execution is disabled. The current service sells data; exchange-order execution
and trading profit-and-loss accounting are not implemented.

Arc Mainnet supplies USDC for funding and gas. Circle Gateway enables offchain
payment authorization and subsequent batched onchain settlement. The October 12
`e01709c` baseline passed 70 tests, TypeScript, production build
and 16 anonymous checks covering public pages, fresh data, durable Redis,
unpaid quotes, funding and allowance safeguards, billing authentication and
preview protection. These are dated baseline results, not a claim about the
current full-suite test count.

On October 12 the owner funded Gateway with 0.01 USDC and completed a corrected
two-wallet purchase for exactly 0.001 USDC. The API returned a live ETH signal;
its SHA-256 matched independently. Production logs show successful billing
reads and the owner confirmed CSV export. Circle subsequently reported the
payment completed, Arc RPC confirmed the linked batch transaction and the
seller's Gateway balance showed the 0.001 USDC credit. Both wallets belong to
the owner; this is a functional test, not independent customer demand or revenue.
The exported CSV contents have not been independently inspected.

A separate staged reliability campaign is now in progress: 1,000 payments in ten
fixed amount tiers totaling 0.232600 USDC before funding gas, with the final
900 payments spread over at least 24 hours. Its isolated payment-test receipt
endpoint is not 1,000 purchases of market signals or exchange trades. The
earlier single-query baseline is excluded. The campaign exercises sequential
payments, spread sessions, identical-authorization replays, controlled response
loss and client restart recovery. Progress and timestamped reconciliation
results are public at https://radar-agent-ivory.vercel.app/validation.

Per-payment attribution relies on Gateway records. Arc receipts independently
verify corresponding batches and aggregate wallet deltas; multiple payments
may share one hash. Reports distinguish accepted, pending and verified payments
from scenario passes and retain observed failures. Supplemental concurrent
replay of an already settled receipt does not establish an initial-settlement
concurrency test. No final 1,000-payment pass or zero-difference conclusion is
claimed while the campaign remains in progress.

The project began as an Encode Club and Circle hackathon prototype. Historical
testnet media and September work remain on the main branch. The October branch
continues that work on Vercel with Free Upstash Redis. No third-party users,
production readiness or prior prizes/funding are claimed.

## 中文介绍

Radar Agent 面向需要按次购买行情数据的 Agent，把公开 ETH、BTC 行情整理成
带时间戳的信号，每次 0.001 USDC。买方在签名前检查报价、网络、收款地址、
钱包身份和预算，收到数据后验证摘要、按确定规则记录判断。账单通过五分钟
有效的只读钱包签名查询，可导出 CSV。目前付款对应数据购买，尚未接入交易
下单或交易盈亏账单，主网资金再平衡执行保持关闭。

10 月 12 日已完成 Arc 主网实测：使用两个本人控制的钱包，购买一次实时
ETH 信号，核对摘要、账单读取和 CSV 导出；Circle 付款状态完成，关联批量
结算交易回执成功，收款方 Gateway 入账 0.001 USDC。这证明功能可运行，
不代表独立客户或营收。CSV 导出由本人确认，导出文件内容尚未独立复核。

另一个分阶段的 1,000 笔付款可靠性测试正在进行：10 档固定金额合计
0.232600 USDC，充值 gas 另计；最后 900 笔分散到至少 24 小时。它使用隔离的
付款测试回执接口，不是 1,000 次行情消费或交易下单，早先的单笔实测不计入。
网站分别展示付款接收、链上核验和场景通过情况，保留失败记录。逐笔归属依赖
Gateway 记录，链上独立核对批次及钱包汇总变化，多笔可以共用同一批次哈希。
已结算账单的并发读取补测不等于首次结算并发测试；最终对账前不宣称全部通过
或最终金额差异为零。

## Evidence and review

- [October 12 deployment baseline checks](../deployment-public-vercel-2026-10-12.json).
- [Live reliability report](https://radar-agent-ivory.vercel.app/validation) and [campaign methodology](../MAINNET_VALIDATION.md).
- [Funding, revocation, paid delivery and batch evidence](../mainnet-pilot-2026-10-12.json).
- [Submission checklist](ARC_MICROGRANTS_CHECKLIST.md).
- [Optional recording script](ARC_MICROGRANTS_DEMO.md).

The acceptance UUID returned by the API is not a chain hash. Circle links it to
the batch transaction above; the batch is shared infrastructure and is not a
separate transaction for each query. The application transaction field uses
that confirmed batch hash, while the deposit is labelled separately as funding.
The stored billing receipt conservatively reports Gateway acceptance and is
not retroactively represented as a separately verified chain receipt.

Earlier same-address attempts failed with self_transfer before settlement. The
configuration now pins buyer 0xefc70a0dedefee6a010bac44de489bafb2fd8422 and recipient 0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C. The excessive
wallet-edited approval was revoked to zero before the successful query. Old
reservations remain intact. Do not repeat the spent one-query experiment.

The owner supplied contact details privately in DoraHacks; they are excluded
from source and this pack. Profile, logo, project links, descriptions, team,
contacts, prior Testnet deployment and no prior funding are filled. The owner
completed final submission on October 12. The success page displays Build
Submitted and confirms Radar Agent is under review for Arc Microgrants.
[View submission status](https://dorahacks.io/hackathon/arc-microgrants/build).
Submission does not establish selection or an award. No optional mainnet video
was submitted.

The official program asks for a working mainnet deployment, public repository,
short explanation and public builder profile. Previously Circle/Arc-funded
work is ineligible. Deadline: October 14, 2026, 23:59 ET; October 15, 11:59
Asia/Shanghai. [Official requirements](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq).

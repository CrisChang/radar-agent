# Radar Agent Arc Microgrants demo script

Updated October 14, 2026. Record a 90-second walkthrough using the completed
October 12 mainnet experiment, its saved receipt and the current validation report.
Public access and real paid delivery have passed; do not purchase again for a video.
Mainnet payment segments remain unrecorded. Do not replace them with testnet
receipts, simulated acceptance or a Gateway reference labelled as a transaction.

## Recording sequence

| Time | On screen | Evidence |
| --- | --- | --- |
| 0 to 15 seconds | Radar Agent homepage, Arc Mainnet badge and 0.001 USDC price | Public production domain; anonymous checks pass |
| 15 to 30 seconds | Health metadata, fresh Coinbase timestamp and an unpaid 402 quote | Existing hosted check record; hide access cookies and credentials |
| 30 to 50 seconds | Saved `/pilot` result: live signal, amount and response digest | Explain the completed signature without initiating another purchase; label the owner-controlled two-wallet test |
| 50 to 65 seconds | `/billing`: read-only receipt query and CSV export | Real receipt for the approved wallet; hide reusable authorization payloads |
| 65 to 80 seconds | `/validation`: reconciliation timestamp, verified payments and scenario passes | Label the isolated payment-test campaign as in progress; no final pass claim |
| 80 to 90 seconds | Confirmed API-fee settlement batch and public source | Show the fee batch independently from funding and Gateway acceptance |

## Chinese voiceover

Radar Agent 是一个给 Agent 使用的按次付费行情接口。它把公开的 ETH 和 BTC
行情整理成带时间戳的信号，一次请求报价为 0.001 USDC。

这里是 Arc 主网配置和实时行情检查。未付款请求返回 402，同时给出明确的
网络、资产、收款地址和价格。

〔使用已完成付款的真实结果录制，不再付款〕买方先核对报价、钱包身份和预算，再签名购买
信号。页面核对返回内容的摘要，账单页通过五分钟有效的只读钱包签名查询记录，也可以导出 CSV。独立的买方 Agent 会按确定规则作出判断，并留下付款与决策日志。

这个实验使用两个本人控制的钱包付款和收款，验证功能，不代表独立客户或收入。

另外在进行 1,000 笔不同金额的付款可靠性测试，总额 0.232600 USDC。
它使用单独的付款测试回执接口，不是 1,000 次行情购买。页面分别展示链上核验
和场景通过，多个付款可以共用一个结算批次。目前不宣称最终全部通过。

〔展示已核验的批量结算回执〕最后展示确认的 Arc 主网交易和公开源码。
本版本验证按次买信号的闭环，主网资金再平衡保持关闭。

## English voiceover

Radar Agent is a pay per query market signal API for other agents. It turns
public ETH and BTC candles into timestamped observations at 0.001 USDC per query.

This view shows Arc mainnet configuration and the fresh hosted feed. An unpaid
request receives HTTP 402 with an explicit network, asset, recipient and price.

[Use the completed paid result; do not pay again.] The buyer checks the quote, approved
wallet and budget before signing. The browser verifies the delivered signal
digest. The billing page reads wallet-scoped receipts using a five-minute
read-only signature and exports CSV. The independent buyer agent also applies
a deterministic rule and records payment and decision events locally.

This owner-controlled two-wallet experiment verifies functionality, not independent demand
or revenue.

A separate 1,000-payment reliability campaign is in progress across ten amounts,
totaling 0.232600 USDC before funding gas. It uses payment-test receipts, not
1,000 market-data purchases. The report separates chain verification from
scenario passes. Several payments can share a settlement batch; no final pass
is claimed while the campaign is running.

[Show the independently verified batch receipt.] We finish with a confirmed Arc
mainnet transaction and the public source. This branch demonstrates signal
purchases; mainnet treasury execution remains disabled.

## Recording preparation

- Use https://radar-agent-ivory.vercel.app. Generated preview URLs still require login.
- Open `/pilot` and `/billing` in the wallet browser. Inspect every signature
  yourself; never show full reusable authorization payloads in the video.
- Show the validation report's reconciliation timestamp. Reservations or HTTP
  acceptance are not confirmed settlement; completed-receipt concurrency
  supplements do not prove initial-settlement races.
- A confirmed Gateway funding transaction may be shown as funding only. Do not
  label a deposit transaction as settlement of the 0.001 USDC API fee.
- Keep wallet screens, signing secrets, reusable payment authorizations and
  access tokens out of the recording and the exported audit.
- For a no-funds rehearsal, run `npm run agent:dry`; label it a simulated run.
- Save the new clip as `arc-microgrants-mainnet-demo.mp4` only after the mainnet
  segments are real. An overview recorded before this completed test must retain its original
  pending label rather than pretending to show the later payment.
- The old checkpoint deck (`docs/deck.pdf`) and prior demo on the main branch
  are historical testnet material, not current mainnet results:
  https://radar-agent-arc-2026.chrischang2026.workers.dev/demo.
  It may explain project history, but cannot substitute for this mainnet run.

The DoraHacks video field is optional. Do not delay or misrepresent a submission
solely to fill this field. Paid delivery and batch settlement are now verified.
CSV export was confirmed by the owner and successful billing logs; its file
contents were not independently inspected.

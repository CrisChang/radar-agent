# Radar Agent Arc Microgrants demo script

Record a 90 second walkthrough after public access and the real mainnet payment
experiment pass. The current hosted checks can supply the opening segments.
Mainnet payment segments remain unrecorded. Do not replace them with testnet
receipts, simulated acceptance or a Gateway reference labelled as a transaction.

## Recording sequence

| Time | On screen | Evidence |
| --- | --- | --- |
| 0 to 15 seconds | Radar Agent homepage, Arc Mainnet badge and 0.001 USDC price | Existing protected Vercel build; public access pending |
| 15 to 30 seconds | Health metadata, fresh Coinbase timestamp and an unpaid 402 quote | Existing hosted check record; hide access cookies and credentials |
| 30 to 55 seconds | One approved buyer request, received live signal and payment receipt | Record only after the real paid mainnet experiment |
| 55 to 75 seconds | Budget refusal and local audit | Label deterministic fixtures or dry runs; no claimed extra payment |
| 75 to 90 seconds | Independently confirmed mainnet transaction and public source link | A Gateway acceptance ID alone is insufficient |

## Chinese voiceover

Radar Agent 是一个给 Agent 使用的按次付费行情接口。它把公开的 ETH 和 BTC
行情整理成带时间戳的信号，一次请求报价为 0.001 USDC。

这里是 Arc 主网配置和实时行情检查。未付款请求返回 402，同时给出明确的
网络、资产、收款地址和价格。

〔实际付款验证通过后录制〕买方先核对报价、钱包身份和预算，再签名购买
信号。收到数据后，它按确定规则作出判断，并留下付款与决策日志。

预算用完时，程序会在产生新付款前拒绝继续。这里展示的模拟或测试用例会
明确标注，不能当成主网交易证据。

〔交易独立核验通过后录制〕最后展示确认的 Arc 主网交易和公开源码。
本版本验证按次买信号的闭环，主网资金再平衡保持关闭。

## English voiceover

Radar Agent is a pay per query market signal API for other agents. It turns
public ETH and BTC candles into timestamped observations at 0.001 USDC per query.

This view shows Arc mainnet configuration and the fresh hosted feed. An unpaid
request receives HTTP 402 with an explicit network, asset, recipient and price.

[Record after the paid experiment succeeds.] The buyer checks the quote, approved
wallet and budget before signing. It receives the live signal, applies a
deterministic rule and records the payment and decision in its local audit.

When the budget is exhausted, the buyer refuses a new payment before signing.
Any fixture or dry-run example is clearly labelled and is not chain evidence.

[Record after independent receipt verification.] We finish with a confirmed Arc
mainnet transaction and the public source. This branch demonstrates signal
purchases; mainnet treasury execution remains disabled.

## Recording preparation

- Use the finalized public origin. The current Vercel preview requires login.
- Keep wallet screens, signing secrets, reusable payment authorizations and
  access tokens out of the recording and the exported audit.
- For a no-funds rehearsal, run `npm run agent:dry`; label it a simulated run.
- Save the new clip as `arc-microgrants-mainnet-demo.mp4` only after the mainnet
  segments are real. An optional overview recorded earlier must say that paid
  mainnet delivery is pending throughout.
- The prior demo on the main branch is historical testnet material:
  https://radar-agent-arc-2026.chrischang2026.workers.dev/demo.
  It may explain project history, but cannot substitute for this mainnet run.

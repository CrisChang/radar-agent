# Radar Agent Arc Microgrants application draft

Updated October 8, 2026. This draft describes the October Vercel branch. Public
launch, a real paid mainnet response and confirmed transaction evidence must
be completed before submission. On October 8, 2026, the owner confirmed this
project has received no prior prizes or funding.

## Project fields

| Field | Value |
| --- | --- |
| Project name | Radar Agent |
| One line description | USDC pay per query market signals with a buyer that enforces spending limits on Arc |
| Source code | https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants — branch publication pending GitHub authorization |
| Builder profile | https://github.com/CrisChang |
| Intended public deployment | https://radar-agent-ivory.vercel.app — not promoted yet |
| Protected build preview | https://radar-agent-jihme1ww1-chris-6239.vercel.app — Vercel login required |
| Network | Arc Mainnet, chain 5042 |
| Signal price | 0.001 USDC per request |
| Mainnet transaction evidence | Pending a real, approved payment experiment and independent receipt verification |
| Mainnet demo video | Pending the paid experiment; recording script is included |
| Prior Circle or Arc prizes or funding | None, confirmed by the owner on October 8, 2026 |

## Short description in English

Radar Agent turns public ETH and BTC market candles into timestamped signals.
A buyer agent uses USDC through Circle Gateway x402, validates the network,
recipient and price before signing, enforces a spending cap and records an
explainable decision. The October branch is configured for Arc mainnet; its
hosted feed and unpaid payment quotes have been verified.

## Detailed description in English

Radar Agent is a small agent commerce prototype. A Next.js seller converts
public Coinbase Exchange candles into structured ETH and BTC observations and
advertises a 0.001 USDC per query price through Circle Gateway x402. A separate
local buyer checks the final quote, its approved wallet identity and its budget
before signing. After receiving a signal, deterministic rules choose hold or a
suggested rebalance and append an audit record. Mainnet treasury transfers are
disabled in this branch. Payments currently purchase market data; this branch
does not place exchange orders or maintain a trading profit-and-loss ledger.

Arc provides the mainnet USDC and Gateway infrastructure for the payment flow.
The October Vercel build has passed authenticated homepage, health, fresh-feed
and unpaid 402 checks with chain 5042 and the configured recipient. These are
configuration and data-availability checks, not proof of paid mainnet delivery.
A real paid response and confirmed chain evidence remain to be collected.

The project began as an Encode Club and Circle hackathon prototype. The
historical testnet demo and September receipt-recovery work are retained on the
repository's main branch. The October Vercel branch is a separate continuation;
it must integrate the durable recovery work before a paid mainnet pilot. No
third-party users, revenue or production readiness are claimed.

## 中文简述

Radar Agent 将公开的 ETH、BTC 行情整理成带时间戳的信号接口。买方 Agent
通过 Circle Gateway x402 用 USDC 购买信号，在签名前检查网络、收款地址、
价格、测试钱包身份和预算，收到数据后按确定规则给出判断并记录审计日志。
十月版本已配置 Arc 主网，云端真实行情和无付款报价检查已经通过。

## 中文详细介绍

项目面向需要按次购买数据的 Agent。卖方提供公开行情信号，每次请求报价
0.001 USDC；买方运行在本机，保留签名凭据、预算状态和审计日志。主网版本
先验证买信号与记录判断的闭环，本分支的资金再平衡执行保持关闭。目前
付款对应行情数据购买，尚未接入币种买卖订单或交易盈亏账单。

Arc 的 USDC 和 Circle Gateway 为小额按次付款提供基础设施。目前 Vercel
构建可运行，真实行情、健康检查和未付款时的 402 响应已验证。实际主网
付款、数据交付和交易证据仍需测试，不能把报价检查写成付款成功。

## Evidence and eligibility

The [deployment record](../deployment-vercel-2026-10-08.json) contains the
October hosted checks. The [submission checklist](ARC_MICROGRANTS_CHECKLIST.md)
separates verified results from remaining gates. The
[demo script](ARC_MICROGRANTS_DEMO.md) specifies a 90 second recording.

The owner confirmed on October 8, 2026 that this project has received no
previous prizes or funding, including from Circle or Arc. This records the
owner's declaration; it does not imply that all other application gates passed.

The official program requires a working mainnet deployment, a public repository,
a short project explanation and a public builder profile. Previously funded
Circle or Arc work is ineligible. Deadline: October 14, 2026, 23:59 ET, which is
October 15, 11:59 in Asia/Shanghai.
[Official Arc Microgrants requirements](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq).

The current user-confirmed test wallet is also the configured recipient. If it
is used on both sides, describe the run as a same-wallet functional experiment;
it is not an independent customer sale or evidence of revenue.

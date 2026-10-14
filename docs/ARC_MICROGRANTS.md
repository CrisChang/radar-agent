# Arc Microgrants submission pack

Target: [Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq).
Deadline: October 14, 2026, 23:59 ET; October 15, 11:59 Asia/Shanghai.
Materials updated October 14, 2026; the reliability campaign remains in progress.

## Project and current result

Radar Agent sells timestamped public ETH/BTC market observations to other agents
for 0.001 USDC per query. Its buyer checks quotes and budgets before signing,
validates delivery and records decisions. Durable receipts can be queried by
wallet and exported as CSV. Exchange trading and profit-and-loss accounting
are not implemented. Mainnet treasury execution is disabled. The private Twitter
Radar pipeline is neither connected nor included in this public repository.

The public service is https://radar-agent-ivory.vercel.app, with current source
on [codex/arc-microgrants](https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants).
The October 12 `e01709c` baseline passed 70 tests, TypeScript, production build
and 16 anonymous cloud checks. Those numbers describe that dated evidence,
not the current full-suite test count. Durable Redis retains payment state;
preview URLs remain protected. No buyer key is hosted.

A real owner-operated two-wallet mainnet test passed: exact 0.001 USDC purchase,
live ETH response and matching digest, authenticated receipt reads, owner-confirmed
CSV export, completed Circle transfer, successful Arc batch and 0.001 USDC seller
Gateway credit. Both wallets belong to the owner. This proves functionality;
no independent customers, revenue or production readiness are claimed.

- Buyer: 0xefc70a0dedefee6a010bac44de489bafb2fd8422.
- Recipient: 0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C.
- [Public deployment checks](deployment-public-vercel-2026-10-12.json).
- [Redacted mainnet evidence](mainnet-pilot-2026-10-12.json).
- [Confirmed API-fee batch](https://explorer.arc.io/tx/0xc407227af427e96af16521bff611e6719c68e6e26e6de9eefae8ee642bd7ed41).
- [Separate funding deposit](https://explorer.arc.io/tx/0xa0286660f1881b42b2679b9e47ae06dfa6e393129a94c71f0fe8654f3a8d9b30).

Earlier same-address attempts were rejected with self_transfer before settlement.
That configuration was corrected before the successful test. A wallet-edited
excess allowance was revoked to zero. Funding and fee settlement are separate;
the API UUID is an acceptance reference, not a transaction hash. Circle links
that reference to the shared batch confirmed independently by Arc RPC.

## Reliability campaign in progress

The [public validation page](https://radar-agent-ivory.vercel.app/validation)
reports a separate 1,000-payment campaign with ten fixed amount tiers and a
0.232600 USDC payment budget. Stages are 10, 90 and 900 payments; the last stage
defaults to a 24-hour schedule; an explicitly signed accelerated timing amendment, if enabled, is disclosed in the live report instead of being counted as original 24-hour completion. These are isolated payment-test receipts,
not 1,000 market-signal purchases or exchange trades. The completed single-query
baseline above is excluded.

Gateway records provide per-payment attribution to shared batch hashes. Arc
receipts independently verify batch execution and aggregate wallet deltas.
Reports distinguish accepted requests, verified payments and scenario passes;
retained failures and pending outcomes are not silently counted as successes.
Supplemental replay of an already settled receipt proves that recovery path,
not initial-settlement concurrency. No final 1,000-payment pass or zero-difference
conclusion is claimed before the final reconciliation. See the
[campaign runbook](MAINNET_VALIDATION.md) for the complete evidence boundaries.

## Application readiness

[Application prose](submission/ARC_MICROGRANTS_APPLICATION.md),
[checklist](submission/ARC_MICROGRANTS_CHECKLIST.md) and
[optional demo script](submission/ARC_MICROGRANTS_DEMO.md) are prepared.
DoraHacks profile, logo, public links, project/team details and owner-supplied
contacts are filled. Prior Arc deployment is Testnet; the owner confirmed no
Circle/Arc grant, bounty or prize for this project. Contacts remain private.

The owner completed the final submission on October 12. DoraHacks displays
Build Submitted and confirms Radar Agent is under review for Arc Microgrants.
This confirms receipt, not selection or an award.
[Submission status](https://dorahacks.io/hackathon/arc-microgrants/build).
A mainnet video has not been recorded; the form makes it optional. Historical
testnet media remains clearly labelled and does not substitute for current evidence.

## Hosting and configuration

The owner selected Vercel and activated Pro Trial. Trial ends October 23; the
existing cancellation-review reminder is October 18 at 10:00 Asia/Shanghai.
No cancellation or separate server purchase has occurred.
See [deployment operations](VERCEL_DEPLOYMENT.md).

```dotenv
ARC_NETWORK=mainnet
PUBLIC_BASE_URL=https://radar-agent-ivory.vercel.app
SELLER_ADDRESS=0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C
PILOT_BUYER_ADDRESS=0xefc70a0dedefee6a010bac44de489bafb2fd8422
SIGNAL_PRICE_USDC=0.001
RADAR_ALLOW_DEMO_SIGNALS=false
RADAR_ACCEPT_PAYMENTS=true
```

Keep buyer credentials, Circle secrets, environment files, private Twitter code
and runtime logs off the host and public repository. Redis integration secrets
remain managed by Vercel/Upstash. The local buyer retains its own audit.

## Operating boundaries

The October 12 one-query budget is spent. Do not purchase again, clear stored
reservations or redeposit for a recording. Read the existing receipt with a
five-minute read-only wallet signature. Unknown outcomes require reconciliation;
accepted and unknown authorizations retain the durable one-settlement cap.

The reliability campaign has its own approved schedule, stage budgets and
reconciliation gates; it does not reopen the spent single-query pilot. For the
original `/pilot`, optional funding is exact 0.01 USDC, with exact approval and
gas at most 0.005 USDC per transaction. Campaign funding follows its separate
[runbook](MAINNET_VALIDATION.md) and displayed remaining shortfall. Never select
unlimited approval or send a plain token transfer to the Gateway contract. Refer to the
[runbook](PILOT_RUNBOOK.md) and [recovery design](PAYMENT_RECOVERY.md).

# Arc Microgrants: current submission pack

**Radar Agent — agent API payments and accounting on Arc.**

The focused product links a priced API request, exact USDC authorization, delivered response, retries and independently inspected settlement evidence. A 0.001 USDC ETH observation is the working service example.

- [Live deployment](https://radar-agent-ivory.vercel.app)
- [One agent integration entry](https://radar-agent-ivory.vercel.app/integrate)
- [Read-only mainnet evidence](https://radar-agent-ivory.vercel.app/evidence)
- [Current source](https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants)
- [DoraHacks build](https://dorahacks.io/build/49626)

## Actual evidence

The public October 14 report verifies **1,000 / 1,000 payments**, ten amount tiers, **0.232600 USDC** principal, **32 shared Arc batches** and **zero atomic-unit batch wallet difference**. Scenario evidence is **993 / 1,000** in the saved snapshot, with seven concurrent-overlap cases pending. The live page displays the latest timestamp and counts rather than promoting a partial scenario result to a final pass.

An earlier separate baseline completed one live ETH query for 0.001 USDC, response SHA-256 verification, wallet-scoped receipt reads and owner-confirmed CSV export. [Baseline evidence](mainnet-pilot-2026-10-12.json).

The 1,000 campaign transactions are isolated payment-test receipts between owner-controlled wallets, not 1,000 customer API sales. Per-payment attribution relies on Gateway; Arc independently verifies shared-batch execution and aggregate wallet deltas. Supplemental settled-receipt concurrency does not establish an initial settlement race. The owner-approved accelerated timing amendment superseded the original 24-hour schedule. Funding gas and other fees are separate from zero principal variance.

[Campaign method](MAINNET_VALIDATION.md) · [Additional audit](MAINNET_AUDIT.md) · [Architecture](ARCHITECTURE.md) · [Application text](submission/ARC_MICROGRANTS_APPLICATION.md) · [Checklist](submission/ARC_MICROGRANTS_CHECKLIST.md)

## Program and submission status

[Official Arc Microgrants requirements](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq): working Arc mainnet deployment, public repository, short explanation and public builder profile. Prior Circle/Arc-funded work is ineligible. The official deadline is October 14, 2026, 23:59 ET, which is October 15, 11:59 Asia/Shanghai.

The owner submitted Radar Agent on October 12. The authenticated DoraHacks management page currently shows **Under Review**. The submitted application management fields are locked while under review; the public Build can still be edited through Edit Build. Submission does not establish selection or funding. No organizer message has been sent.

Owner-confirmed facts: no earlier Circle/Arc prize or grant for this project; earlier Arc deployment was Testnet. Private contact details remain solely in the application. Historical testnet media is labelled separately; no optional new mainnet video is claimed.

## Hosting and operation

Vercel hosts the service with durable Upstash Redis. Buyer keys stay local. The one-query owner pilot is spent; operator pages are excluded from normal navigation and indexing. No funding or another purchase is required to inspect public evidence.

The Vercel Pro Trial reminder remains October 18 at 10:00 Asia/Shanghai, before the October 23 trial end. No extra server was purchased or cancellation performed by this update.

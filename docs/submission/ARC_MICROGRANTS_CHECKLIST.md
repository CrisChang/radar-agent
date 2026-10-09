# Radar Agent Arc Microgrants submission checklist

Updated October 9, 2026. Code and application prose are prepared on the October
Vercel branch. The application remains a draft until the open gates below pass.

## Verified preparation

- Durable receipt recovery, budget reservations and buyer locking are ported.
- Wallet-authenticated billing API, browser receipt page, CSV export, browser
  payment pilot, OpenAPI and external-agent examples are implemented.
- All 56 regression tests pass, including real local Redis concurrency, restart,
  lost-acknowledgement recovery and wallet privacy isolation. TypeScript and
  production build pass. Cloud database activation remains pending.

- Vercel production build is READY and retains login protection.
- Authenticated homepage and health return 200; unpaid signal requests return 402.
- Hosted Coinbase candles are fresh. Price is 0.001 USDC; chain is 5042.
- Owner confirmed the configured recipient is the intended test wallet.
- Owner confirmed on October 8, 2026 that this project has received no prior
  prizes or funding, including from Circle or Arc.
- The repository is publicly visible. The October branch is prepared locally;
  publication is awaiting GitHub authorization. Intended source link:
  https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants.
- A local mainnet configuration is prepared with the approved buyer address,
  a one-query fee cap, zero treasury budget and deposits disabled. It contains
  no signing key. These settings do not authorize a payment.
- English and Chinese application descriptions and a 90 second demo script
  are included in this folder.

## Open gates

| Gate | What completes it |
| --- | --- |
| Vercel plan and anonymous access | Activate an eligible plan under accepted billing terms, promote the domain and verify access without Vercel login |
| Buyer signing | Browser-wallet signing is implemented; connect the owner-confirmed test wallet and approve the exact bounded experiment |
| Cloud ledger activation | Approve and connect retained Free Upstash Redis to Vercel; verify storage readiness before enabling payments |
| Bounded payment approval | Approve the 0.001 USDC signal purchase plus any separately quoted Gateway deposit and gas cap |
| Real mainnet delivery | Receive and validate a fresh paid response; save a redacted buyer receipt and audit |
| Confirmed chain evidence | Independently verify a mainnet receipt and publish its explorer link; distinguish Gateway acceptance from chain confirmation |
| Demo recording | Record the new mainnet segments using ARC_MICROGRANTS_DEMO.md |

The wallet and recipient currently refer to the same owner-confirmed address.
A same-wallet test must be labelled as such. It proves a functional path, not
independent demand or earned revenue.

## Evidence directory

| Item | Location or state |
| --- | --- |
| Hosted read-only checks | ../deployment-vercel-2026-10-09.json |
| Agent integration and API contract | ../AGENT_INTEGRATION.md |
| Payment recovery and storage setup | ../PAYMENT_RECOVERY.md |
| Mainnet execution sequence | ../PILOT_RUNBOOK.md |
| October application fields | ARC_MICROGRANTS_APPLICATION.md |
| Demo script and bilingual narration | ARC_MICROGRANTS_DEMO.md |
| Existing September architecture and recovery work | https://github.com/CrisChang/radar-agent/blob/main/docs/ARC_MAINNET_PLAN.md |
| Paid mainnet receipt | Not captured |
| Confirmed mainnet explorer link | Not captured |
| New mainnet video | Not recorded |
| Prior funding declaration | No prior prizes or funding, confirmed by the owner on October 8, 2026 |

Keep balances, secrets, full reusable authorizations and private runtime logs
out of public materials. The hosting check record includes no wallet signature.

## Submission process

Review the final links and descriptions, recheck the official rules, fill the
DoraHacks application, and inspect it before submission. Submission has not
been performed. Owner identity, contact information and eligibility declarations
must be accurate; do not infer them from repository history.

Official program: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq.
Application: https://dorahacks.io/hackathon/arc-microgrants.

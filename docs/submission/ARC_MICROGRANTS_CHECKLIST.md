# Radar Agent Arc Microgrants submission checklist

Updated October 12, 2026. Code and application prose are prepared on the October
Vercel branch. The application remains a draft until the open gates below pass.

## Verified preparation

- Durable receipt recovery, budget reservations and buyer locking are ported.
- Wallet-authenticated billing API, browser receipt page, CSV export, browser
  payment pilot, OpenAPI and external-agent examples are implemented.
- All 59 regression tests pass, including real local Redis concurrency, restart,
  lost-acknowledgement recovery and wallet privacy isolation. TypeScript and
  production build pass. Free Upstash Redis is connected with eviction disabled.
- Cloud storage readiness and five synthetic signed billing checks pass; all
  15 hosted checks pass. No owner wallet or paid request was used.

- Vercel production build is READY. The production domain is public; generated
  deployment and preview URLs retain login protection.
- Authenticated homepage and health return 200; unpaid signal requests return 402.
- Hosted Coinbase candles are fresh. Price is 0.001 USDC; chain is 5042.
- Owner corrected the mainnet pilot wallet and recipient on October 9 to
  `0xefc70a0dedefee6a010bac44de489bafb2fd8422`. Earlier deployment records are historical.
- Ten current hosted checks verify the corrected recipient, pilot page, unpaid
  quote, live feed, storage and disabled payments; no owner signature was used.
- Owner personally activated Pro Trial; Billing shows October 23 as the end
  date, with a local cancellation review reminder on October 18 at 10:00.
- Owner confirmed on October 8, 2026 that this project has received no prior
  prizes or funding, including from Circle or Arc.
- The repository and October branch are publicly visible. GitHub authorization
  is complete and `codex/arc-microgrants` has been pushed. Source link:
  https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants.
- A local mainnet configuration is prepared with the approved buyer address,
  a one-query fee cap, zero treasury budget and deposits disabled. It contains
  no signing key. These settings do not authorize a payment.
- English and Chinese application descriptions and a 90 second demo script
  are included in this folder.

## Open gates

| Gate | What completes it |
| --- | --- |
| Anonymous access | Complete: public domain promoted and 13 anonymous checks pass |
| Buyer signing | Browser-wallet signing is implemented; connect the owner-confirmed test wallet and approve the exact bounded experiment |
| Bounded payment approval | Owner reviews optional 0.01 USDC deposit, 0.005 USDC gas cap per transaction and one 0.001 USDC query in the published wallet UI |
| Real mainnet delivery | Receive and validate a fresh paid response; save a redacted buyer receipt and audit |
| Confirmed chain evidence | Verify the actual funding receipt; label funding and Gateway acceptance separately from API-fee batch settlement |
| Demo recording | Record after real payment; optional in the official form |
| Application contact and review | Owner-supplied contacts, prior Testnet deployment and no prior funding are filled; add verified mainnet evidence and review before submission |

The wallet and recipient currently refer to the same owner-confirmed address.
A same-wallet test must be labelled as such. It proves a functional path, not
independent demand or earned revenue.

## Evidence directory

| Item | Location or state |
| --- | --- |
| Current wallet and hosted read-only checks | ../deployment-wallet-vercel-2026-10-09.json |
| Historical hosted checks before wallet correction | ../deployment-vercel-2026-10-09.json |
| Historical Free storage activation and signed read checks | ../deployment-storage-vercel-2026-10-09.json |
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

## October 12 additions

- [Public deployment evidence](../deployment-public-vercel-2026-10-12.json):
  13 passing anonymous checks, live feed and store ready, no owner signatures.
- Bounded browser funding implemented and deployed; exact approval, expiring
  simulated quotes, account/chain checks, gas ceilings and repeat protection.
- Wallet-confirmed one-query payment enabled. Actual mainnet delivery pending.
- DoraHacks profile, logo, public links, details, team and owner-supplied contacts
  are filled. Prior Arc deployment is Testnet. Mainnet evidence and final
  application submission remain pending.

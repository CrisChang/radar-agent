# Radar Agent Arc Microgrants submission checklist

Updated October 12, 2026. Technical pilot passed and owner submission succeeded;
DoraHacks confirms the application is under review.

## Verified

- Public Vercel production domain: https://radar-agent-ivory.vercel.app.
  Generated deployment and preview URLs retain login protection.
- Runtime source e01709c passes 70 tests, TypeScript and production build.
  Sixteen anonymous cloud checks pass, including live Coinbase data, durable
  Free Upstash Redis, chain 5042 quotes, exact funding and allowance safeguards,
  buyer/recipient separation, authenticated billing and preview protection.
- Public code: https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants.
- Owner-operated funding: 0.01 USDC deposit confirmed; excessive allowance
  revoked to zero. Actual transaction calldata and bounded gas verified.
- Two distinct owner-controlled wallets completed one 0.001 USDC paid query.
  Live ETH response and SHA-256 matched; buyer Gateway funds decreased by 0.001.
- Two production billing requests returned 200; the owner confirmed CSV export.
  Exported file contents were not independently inspected.
- Circle transfer status completed; Arc RPC receipt success at the Gateway
  contract; seller Gateway credit 0.001 USDC, pending batch zero.
- Persistent one-query cap and stored reservations prevent another pilot
  settlement. Accepted and unknown outcomes are not automatically retried.
- Owner confirmed no previous Circle/Arc grant, bounty or prize for this project.
  Prior Arc deployment is Testnet.
- DoraHacks profile/logo/links/descriptions/team and owner-supplied contact
  fields are filled. Private contact details are excluded from public files.
- Pro Trial ends October 23; existing cancellation-review reminder is October
  18 at 10:00 Asia/Shanghai. No cancellation or extra server purchase performed.

## Submission and remaining limits

| Item | State |
| --- | --- |
| Final application | Owner submitted October 12; DoraHacks success page confirms Radar Agent is under review |
| Terms and Submit for Review | Owner completed; agent independently observed Build Submitted |
| Award decision | Not issued; submission is not selection or grant payment |
| Optional mainnet video | Not recorded; not required by the form |
| Independent customers/revenue | Not established; two wallets belong to the owner |

## Evidence

| Evidence | Location |
| --- | --- |
| Current anonymous deployment checks | ../deployment-public-vercel-2026-10-12.json |
| Funding/revoke/paid signal/billing/batch checks | ../mainnet-pilot-2026-10-12.json |
| Confirmed API-fee batch | https://explorer.arc.io/tx/0xc407227af427e96af16521bff611e6719c68e6e26e6de9eefae8ee642bd7ed41 |
| Confirmed funding deposit | https://explorer.arc.io/tx/0xa0286660f1881b42b2679b9e47ae06dfa6e393129a94c71f0fe8654f3a8d9b30 |
| Agent API contract | ../AGENT_INTEGRATION.md |
| Recovery and storage design | ../PAYMENT_RECOVERY.md |
| Mainnet operating runbook | ../PILOT_RUNBOOK.md |
| Application prose | ARC_MICROGRANTS_APPLICATION.md |
| Optional demo script | ARC_MICROGRANTS_DEMO.md |

The funding transaction is not API-fee settlement. The API's UUID is an
acceptance reference; Circle subsequently linked it to a shared batch whose
success was independently checked through Arc RPC. Billing exports preserve
the original acceptance classification. The earlier self_transfer failures
never reached settlement and are not counted as paid tests.

Keep request IDs, reusable authorizations, signatures, contact information,
private runtime logs and unrelated wallet balances out of public materials.
Historical October 9 records retain their original statuses and recipients.
Do not buy again to record a video or retry after refresh.

Official program: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq.
Application: https://dorahacks.io/hackathon/arc-microgrants.
Deadline: October 15, 2026, 11:59 Asia/Shanghai.

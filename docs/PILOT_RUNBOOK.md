# Mainnet pilot runbook

Prepared October 9, 2026. The owner confirmed the intended test wallet and
no prior prizes or funding. No owner-wallet payment signature, deposit or paid purchase has
been made during this implementation.

On October 9, the owner corrected both the mainnet pilot wallet and seller
recipient to `0xefc70a0dedefee6a010bac44de489bafb2fd8422`. Earlier deployment evidence records retain
the previous recipient and are historical. Ten read-only checks pass for the
[new deployment](deployment-wallet-vercel-2026-10-09.json); recheck before
any signing. Wallet identity configuration does not authorize funding or payment.

## Prepared

- Vercel-compatible durable receipt adapter and safe response replay.
- Wallet-authenticated receipt query, JSON/CSV export and `/billing` page.
- Browser wallet `/pilot`, pinned to the owner-confirmed same-wallet test.
- Agent discovery example and OpenAPI contract.
- Budget reservations, unknown-payment pause and buyer process lock.
- Full regression suite and production build.

## Required sequence

1. GitHub authorization and branch publication are complete. Verify the final
   `codex/arc-microgrants` source and evidence links before submission.
2. The owner activated the Vercel Pro trial on October 9. Billing shows
   October 23 as the trial end; a local reminder is scheduled for October 18
   at 10:00 Asia/Shanghai to review cancellation and hosting needs.
3. Free Upstash Redis is connected, with eviction disabled; storage readiness
   and synthetic signed billing reads pass. Recheck `/api/health?feed=1&store=1`
   before the paid pilot. Do not replace it with a 72-hour scratch database.
4. Publish the intended public origin and verify anonymous health, OpenAPI,
   unpaid 402, receipt authentication and the disabled payment pilot.
5. Read the approved wallet's Gateway balance. If sufficient, approve one
   0.001 USDC purchase. If not, prepare a separate exact Gateway deposit and gas
   quote for owner approval. No auto-deposit or unlimited token approval.
6. Enable payments only after those gates, then the owner signs through `/pilot`
   or an approved locally configured buyer. Do not export a wallet key for chat.
7. Validate the received signal, exact response digest and wallet-scoped receipt;
   export a redacted audit and CSV. A lost result must stop new payments.
8. Independently verify any mainnet transaction evidence. Label deposits,
   Gateway acceptance references and confirmed fee settlements separately.
9. Record the 90-second mainnet demo and finalize the application fields.
   Review the final application before submission; it has not been submitted.

The payment authorization permits a single 0.001 USDC payment and has an
approximately seven-day validity window required by Gateway batching. This
runbook and configured caps are preparation, not owner payment approval.

The seller currently sells public Coinbase market observations. Exchange-order
execution, profitable trading claims and third-party customer revenue are out
of scope for this pilot.

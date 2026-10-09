# Mainnet pilot runbook

Prepared October 9, 2026. The owner confirmed the intended test wallet and
no prior prizes or funding. No mainnet signature, deposit or paid purchase has
been made during this implementation.

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
2. Confirm the Vercel plan's actual card and automatic-renewal terms. The
   previously observed trial requires a card; no subscription is active.
3. Approve Upstash integration terms and install a retained Free Redis database.
   Connect it to `radar-agent` production. Verify eviction is disabled and run
   `/api/health?feed=1&store=1`. Do not use a 72-hour scratch database.
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

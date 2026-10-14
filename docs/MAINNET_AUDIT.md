# Independent mainnet payment accounting audit

The campaign plan contains exactly 1,000 logical payments, ten atomic-amount tiers with 100 payments each, totaling **232600 atomic units = 0.232600 USDC**. Amount tolerance is zero.

The public reconciliation has verified all 1,000 payments in 32 shared Arc batches. Seven concurrent-overlap cases remain open in the October 14 snapshot; payment success and scenario completeness are separate results.

## Completed public/local audit

The independent read-only audit fetched provider history again, checked all 1,000 published plan rows and stored response digests, and matched 1,000 completed provider transfers by exact amount/batch group. It individually matched the 900 local authorization nonces and response hashes. All 32 Arc batches were re-read and decoded; both wallet differences remained zero. Expected and actual principal were exactly 232600 atomic units.

The first 100 browser rows currently rely on published server attribution and matching provider amount/batch groups, not an independent comparison of their private nonce values. The report marks `private_export_audit_complete: false`. Original server interval analysis remains unmeasured until the existing private exports arrive.

Reproduce this scope with `tsx scripts/audit-public-mainnet.mts`. It reads only public status, provider history, Arc RPC and the existing private local journals; it publishes no authorization or nonce values.

## Additional audit procedure

The owner uses the existing wallet-authenticated export buttons on `/validation` to download all private receipts and all attempt/state events. These APIs already exist; the audit does not create a new data-access capability. Files stay local.

```bash
npm run audit:mainnet -- --receipts /path/to/receipts-private.json --events /path/to/events-private.json
```

The default paths are the existing campaign filenames in the owner's Downloads directory. The audit script reads the two private exports, local journals, Circle Gateway transfer history and Arc RPC. Its transport rejects payment submissions, signature requests and database writes. It never loads a key.

Checks:

1. Exactly 1,000 unique planned intents and saved server receipt records.
2. Exact expected amount, payer, recipient, asset and network for every row.
3. Unique nonce/transfer attribution and no duplicate provider charges for campaign authorizations.
4. Stored response digest equals the deterministic expected payment-test payload. Raw server response bodies are not exported; expected bytes are reconstructed from the frozen plan.
5. All 900 later local authorizations, nonce identities, fingerprints and response digests match the server records. The first 100 browser journals are not available on this Mac; their server receipts and provider records are checked.
6. Every relevant batch succeeds at the correct contract with canonical confirmations and the matching event. Decode wallet deltas and compare against all provider movements involving either wallet in each batch.
7. Retain all actual attempts and failure statuses; derive scenario evidence from server event intervals and ledger order.

The redacted output is `data/mainnet-audit.json`; `data/mainnet-report.json` is a dated public reconciliation snapshot. Neither publishes reusable authorizations, nonce values, private request IDs, contacts or credential material.

## What loss and overhead mean

| Measure | Definition |
| --- | --- |
| Payment principal variance | Sum of actual campaign transfers minus frozen expected amounts |
| Batch wallet variance | Independently decoded wallet delta minus all matching provider movements for that wallet and batch |
| Duplicate charge count | Multiple provider transfers attributed to one campaign authorization |
| Extra HTTP attempts | Actual attempt starts minus unique logical payments; includes intentional test retries and receipt reads |
| Server request interval | Matching server attempt start/finish timestamps; excludes client networking, quote and signing |
| Shared batch gas | Receipt gasUsed × effectiveGasPrice, in native 18-decimal USDC, paid by batch submitters |
| Funding/provider/infrastructure cost | Separate categories; not inferred as zero or allocated to each call |

Shared-batch gas is not a campaign-only or per-request fee. This audit does not establish all-in caller cost. Operator timestamps/logs are evidence with operational trust assumptions, not independent clock attestations.

The payments are owner-controlled functional tests. Per-payment attribution relies on Gateway, while Arc independently verifies aggregate batch movement. Receipt-only concurrency supplements cover cached reads after settlement. The accelerated schedule is explicitly disclosed; the original 24-hour plan was not completed.

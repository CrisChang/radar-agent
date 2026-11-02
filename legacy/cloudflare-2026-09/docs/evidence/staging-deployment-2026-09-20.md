# Radar independent staging — September 20, 2026

Scope: owner-approved separate Cloudflare Worker + D1 for **Arc Radar Agent**.
This is a manually compiled deployment/CLI observation log, supplemented by the
machine-generated HTTP reports below. It is not paid-delivery or customer evidence.

## Deployed resources

| Item | Observed value |
|---|---|
| Origin | https://radar-agent-integration-staging.chrischang2026.workers.dev |
| Config | `wrangler.staging.jsonc` |
| Worker | `radar-agent-integration-staging` |
| Account | `79bcc4ddd9361af6c9c70466045256aa` — original Radar account |
| D1 / binding | `radar-payments-staging` / `RADAR_PAYMENTS` |
| D1 ID | `0e20babb-e633-46f9-8201-015536766ac9` |
| Migration | `0001_payment_receipts.sql`, applied remotely |
| First deployment version | `bd50128d-8fec-4455-af69-b13136e4456c` |
| Current deployment version | `1bdc80f5-8a04-41f1-b8a9-b4d7fb5a8159` |
| Network | Arc Testnet, chain ID 5042002 |
| Payment acceptance | `RADAR_ACCEPT_PAYMENTS=false` |
| Demo signal mode | Disabled |
| Mainnet execution | Code-blocked |

Official Wrangler OAuth completed; no plan upgrade or purchase was performed.
No private keys or Circle custody credentials were uploaded. The public historical
testnet seller address is quotation metadata only, not approval to use that wallet
for a new paid pilot. Wallet control and spending limits still require confirmation.

## HTTP and local verification

- [Local Worker/D1 test](worker-d1-2026-09-20T10-27-06-635Z.json): isolated
  Miniflare/workerd with outbound HTTP disabled; not a live paid test.
- [Cloud discovery smoke test](cloud-staging-2026-09-20T10-34-29-716Z.json):
  health and OpenAPI 200; ETH/BTC quotes 402; invalid query and disabled demo 400;
  synthetic non-authorization payment header 503 / `not_settled`.
- [Independent project-owned HTTP probe](agent-probe-2026-09-20T10-34-31-478Z.json):
  health, OpenAPI, quote network/asset/amount and seller allowlist checks passed.
- Earlier successful observations are also retained:
  [cloud checks](cloud-staging-2026-09-20T10-31-53-745Z.json) and
  [client probe](agent-probe-2026-09-20T10-31-54-186Z.json).
  These earlier files predate the explicit transport field and also used the proxy.
- Automated regression suite: 47 tests passed; typecheck and staging build passed.

Direct local Node fetch failed with connection timeout/unreachable errors, and a
direct curl request timed out. We then used the existing, enabled system HTTPS
proxy at `127.0.0.1:7897`, with `HTTPS_PROXY` and `NODE_USE_ENV_PROXY=1` for the
Node probes. No TLS verification was disabled. The initial failures were CLI
observations, not successful JSON reports. Successful latency figures describe
this proxy-assisted path only, not multi-region availability or a production SLA.

## Synthetic cloud D1 persistence, not a payment receipt

The explicit staging-only SQL in `scripts/staging-storage-probe.sql` created one
row in a separate `radar_staging_probe` table after the first deployment.
Wrangler remote SELECTs before and after the second deployment returned the same:

```json
{
  "probe_id": "2026-09-20-deployment-probe",
  "classification": "synthetic_storage_only",
  "payload": "Radar staging persistence check: no signature, payment, signal delivery or chain transaction.",
  "created_at": "2026-09-20T10:30:40.229Z"
}
```

`SELECT COUNT(*) FROM payment_receipts` returned **0** before and after redeployment.
Verification SELECTs reported no changed database state or rows written. The
labelled synthetic row is retained for audit and does not enter the payment ledger.
This confirms that this D1 record survived redeployment, not complete paid-request
recovery, concurrent distributed operation, backup readiness or settlement recovery.

## Metadata exclusion and historical preservation

An initial upload included macOS `.DS_Store` metadata from the existing public
folder. `public/.assetsignore` was added, then the staging bundle rebuilt and
redeployed. The owner's local metadata files were not deleted or committed.
After redeployment `/.DS_Store` and `/.assetsignore` returned empty 200 responses
from the dotfile fallback, not the local file contents. This is not a 404 claim.

`wrangler deployments list` for the historical `radar-agent-arc-2026` Worker
showed the same active version before and after this work:
`f283f19c-d82d-45c4-b8dc-a55da1c753e3`, deployed August 7, 2026 at
05:04:03.686Z. Its health endpoint still returned 200. No old Worker/D1 or
SwapGuard resources were modified.

## Evidence boundaries and next gates

- New signed requests: **0**; accepted payments: **0**; paid signals delivered: **0**;
  chain transactions: **0**. Unpaid quotes are not sales.
- The client is maintained by this project, not a consenting third-party customer.
- The public `/api/proof` still labels historical testnet fixture replay; it does
  not establish new staging execution or mainnet delivery.
- Next: tested operator reconciliation for unknown outcomes; explicit testnet
  wallet/control/budget approval; bounded cloud paid-delivery/recovery experiment;
  consenting external Agent pilot. Mainnet needs a separate release decision.
- Microgrants and Marketplace applications have not been submitted. Public
  discovery/OpenAPI alone does not meet working paid/mainnet-service requirements.

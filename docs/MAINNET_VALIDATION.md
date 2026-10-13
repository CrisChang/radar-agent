# Mainnet payment reliability campaign

Status: implemented, pushed and deployed to [the public validation page](https://radar-agent-ivory.vercel.app/validation); **no new mainnet payment has been executed by this work**. Production source commit `086bfe6`, deployment `dpl_9enbrfFJrFwBc7PRfbjWomXHp2Ci`. All nine unsigned online checks passed on 2026-10-13; durable state was unapproved and the new campaign count was zero. See `validation-deployment-2026-10-13.json` for the timestamped deployment evidence. The live page and durable campaign state, not this document, determine actual progress. The earlier 0.001 USDC pilot is a separate baseline and is excluded from the 1,000-payment target.

## Frozen scope

Campaign `arc-mainnet-reliability-1000-v1`, Arc Mainnet `eip155:5042`, six-decimal USDC. The configured pilot buyer pays the separately configured seller. Both are owner-controlled accounts. These are functional test payments, not customer revenue, independent users, trading volume or adoption.

The isolated `/api/validation/payment?intent=planned-0001` resource delivers a small payment-test receipt. Production `/api/signals/latest` stays at 0.001 USDC and retains its original one-payment pilot cap. Campaign and production share durable nonce/request indexes; a new endpoint cannot reuse a previously consumed authorization.

| Amount per payment (USDC) | Unique payments |
|---:|---:|
| 0.000001 | 100 |
| 0.000002 | 100 |
| 0.000005 | 100 |
| 0.000009 | 100 |
| 0.000010 | 100 |
| 0.000099 | 100 |
| 0.000100 | 100 |
| 0.000101 | 100 |
| 0.000999 | 100 |
| 0.001000 | 100 |

Total: **232,600 atomic units = 0.232600 USDC**. Amounts are integer units fixed by the server schedule; clients cannot select a price or change one during retries. `docs/validation-schedule.jsonl` is the exact frozen schedule, SHA-256 `1adde180d066de78188bdad2066463e0a56b00f17e55ffb752d03880c00ec779`. Its matching JSON supplies the runtime. All original schedule entries are `not_run`; never edit the schedule to manufacture results.

| Stage | New payments | New payment budget | Cumulative cap |
|---|---:|---:|---:|
| 1 | 10 | 0.002326 USDC | 10 / 0.002326 USDC |
| 2 | 90 | 0.020934 USDC | 100 / 0.023260 USDC |
| 3 | 900 | 0.209340 USDC | 1,000 / 0.232600 USDC |

Each stage needs a fresh owner wallet signature binding the canonical site origin, campaign, schedule hash, chain, payer, recipient and exact count/amount caps. Approval lasts three days, without automatic renewal. It does **not** sign payments or authorize gas, deposits, withdrawals or ERC-20 approvals. Every payment needs its own exact-amount EIP-712 authorization. Previous stages must be fully reconciled before advancing.

Claims, count/amount reservations, intent indexes and state events are one atomic Redis operation. Claims allow one new intent in flight. Replays can be concurrent but do not reserve new money. Reservations are never released because of an uncertain result. Unknown or rejected outcomes halt new payments; no fresh nonce replaces them. Funding and signing fail closed without durable storage. Keep Redis eviction disabled; do not delete campaign keys, use a different wallet, or reset a namespace to evade a cap.

Stage 3's 900 intents are spaced over at least 24 hours. The server enforces the earliest time of each intent; speeding up the client cannot bypass it. The browser must stay open for waiting, and a local runner must remain awake; Vercel only handles short requests and does not run the 24-hour client loop. Interrupted work resumes from its private journal.

## Scenarios and what they prove

| Scenario | Unique payments | Additional behavior |
|---|---:|---|
| Sequential | 600 | One intent in flight |
| Spread sessions | 200 | Checkpoint every 20 such payments, creating a new client run session |
| Serial replay | 100 | Submit the identical authorization twice; require identical response bytes |
| Concurrent replay | 50 | Two identical submissions concurrently; only one settlement; pending responses may be 409 |
| Response loss | 25 | Deliberately discard the first HTTP response, then replay the exact saved authorization |
| Client restart | 25 | Exit/refresh after the first accepted response; a new process/page boot must recover the same authorization |

Every amount appears in every scenario (60 amount/scenario combinations). Retries are HTTP attempts, not new payments. Response-discard cases are controlled client fault injection, not claims of random network outages. Client restart cases use actual new process/page boots. Negative amount, changed quote, duplicate nonce, wrong network, wrong parties and budget rejection tests run locally without spending funds; do not invent onchain hashes for pre-broadcast rejection.

## Browser operation

1. Open `/validation` on the same trusted computer/browser that controls the funded buyer wallet. Select Arc Mainnet (5042), check the displayed buyer and seller, connect, and check the stage budget box.
2. Approve **stage 1: 10 payments / 0.002326 USDC**, then check the box again and run the stage. This uses the existing Gateway balance and needs no deposit if that balance is sufficient. The extension will ask for each payment signature; check the exact amount each time.
3. Run **read-only reconciliation**. It needs a free owner control signature. Wait for Gateway `completed`, a canonical successful batch with three confirmations, decoded net deltas and complete attribution. Do not advance on HTTP 200 alone.
4. Only after the first ten payments reconcile, review optional funding for the remaining stages. The server calculates the unfunded remainder of the 0.232600 USDC campaign, capped at **0.223600 USDC**. Existing funds are reused. No automatic funding occurs.
5. Funding requires a separately reviewed exact ERC-20 approval, a new quote after that approval, and a separate `deposit(USDC, amount)` transaction. Each transaction's gas ceiling is **0.005 native USDC**, combined at most 0.01 USDC. Never use unlimited approval or transfer tokens directly to the Gateway address. The client checks the actual broadcast calldata, wallet, destination, receipt gas and remaining allowance. After a deposit, the allowance must be zero. A pending/unknown transaction must be recovered using its original hash, not resent.
6. Reconcile and approve stages 2 and 3 separately. For 1,000 payments the local runner below avoids 1,000 browser popups, if the owner chooses and configures a local signing adapter. Never put a buyer signing key in Vercel, source control, chat or public exports.
7. Use the page's public JSON/CSV downloads for all report rows. The private wallet-signed export paginates until `next_offset` is null and includes all receipts or append-only events. Each page signature is scoped to the exact URL and expires after five minutes. The original `/billing` newest-100 list is not a complete campaign export.

The browser stores exact signed authorizations in its own local storage before submitting. The CLI uses a private directory and files with permissions 0700/0600, fsync and atomic rename. These authorizations remain spendable for roughly seven days; protect this local state and do not share it. Neither version uploads a signing key or stores reusable payment signatures in Redis. Server event records include attempts and transitions, not signatures. Browser reconnects and private-journal edits do not reset server caps.

Stopping the local loop stops subsequent requests. The separately signed **pause** action halts server-side new claims. Neither revokes signatures already created. After all reserved payments reconcile, the owner can sign **resume** within the original approval lifetime; it does not extend the expiry or budget. If a signing result has no recoverable journal, stop and inspect it rather than signing again.

## Optional local runner

Dry run is the default and does not access the network or a signer:

```sh
npm run validation:plan -- --stage 1
```

For live execution, first approve that stage on the website. Then the **owner** selects a local module exporting `createSigner()` with `{ address, signTypedData(params) }`. A hardware-wallet or other locally controlled adapter may implement this interface; the browser is the ready-to-use path for the first ten payments. A ready optional adapter is `examples/validation/owner-signer.mts`. It requires the owner to explicitly set `RADAR_VALIDATION_LOCAL_KEY_CONSENT=LOCAL_TEST_WALLET_ONLY` and configure `RADAR_VALIDATION_PRIVATE_KEY` privately on their own computer. It reads neither variable during a dry run and is excluded from Vercel. Do not send the key through chat or let the assistant read it. Prefer the browser if you do not want a local signing key. The adapter checks chain, Gateway, recipient and the 1–1,000 atomic-unit per-payment bounds; overall limits additionally rely on the frozen runner journal and server budgets. This is software enforcement, not a cryptographically limited key. The runner does not discover key files, load `.env` files, choose credentials, or fund a wallet. Do not ask another person/agent to handle the buyer key.

```sh
npm run validation:run -- --execute --stage 3 \
  --origin https://radar-agent-ivory.vercel.app \
  --payer 0xefc70a0dedefee6a010bac44de489bafb2fd8422 \
  --seller 0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C \
  --signer-module ./examples/validation/owner-signer.mts \
  --journal-dir /absolute/private/path/to/validation-journal \
  --wait --auto-restart
```

`--execute` is required for any network/signing work. `--wait` respects the fixed timestamps. `--auto-restart` supervises real child processes: exit code 75 is a controlled session/restart checkpoint, and the next process resumes the saved authorization. Without supervision, rerun the same command after a checkpoint. A transport-unknown result stops the runner; only the saved original authorization may be replayed. A changed quote, wallet, origin, recipient or amount stops signing.

A per-directory lock prevents two local runners from using the same journal. A crash may leave the lock: first verify that no process is running and inspect/reconcile existing records before manually removing only that stale lock. Never remove payment journals or server reservations as a recovery shortcut.

## Reconciliation and public conclusions

The reconciler is read-only with respect to money. It paginates all Gateway transfers involving either test wallet in either direction, including outside-campaign transfers needed to explain a shared batch's net changes. It matches each local nonce, amount, parties, network and acceptance UUID. Duplicate transfers for one authorization, mismatched terms, missing index records or incomplete pagination cannot pass.

It independently fetches Arc transactions, receipts, canonical blocks and confirmations, decodes `submitBatch(bytes,bytes)` using Circle's `BatchedDelta[]` ABI, verifies domain 26, USDC, Gateway address, zero total delta, and the matching `BatchProcessed` event. Any `InsufficientBalance` event fails the batch even if receipt status is success. For **both** buyer and seller it compares decoded chain deltas against all attributed transfers in that same batch. This explicitly accounts for other payments sharing that batch; unrelated transfers are not counted toward the 1,000 target.

If settlement was accepted but an acknowledgement was lost, a single matching completed transfer plus independently verified aggregate batch evidence can restore the previously prepared response and mark it accepted. It never submits a new payment. Unprovable outcomes remain unknown. Provider/RPC failures halt new claims and leave the conclusion pending review; retry read-only reconciliation, not a payment.

Per-payment attribution is **provider-mediated** (nonce → transfer → batch). The chain independently proves aggregate wallet deltas, not every individual offchain authorization. Scenario completion is checked against exact-authorization attempt fingerprints and HTTP results. Discard/restart/session labels are client-reported; concurrent overlap uses server timestamps and is not independently attested. Ten distinct spread-session labels are required for the final pass. Public reports label this evidence level and distinguish unique payments, HTTP attempts and distinct batch hashes. No result is a claim of 1,000 unique blockchain transactions.

Money tolerance is **zero atomic units**; rounding is prohibited. A final pass requires all 1,000 payments verified, no unresolved errors or duplicates, exact matching amounts and at least 24 hours elapsed. Partial/pending data has `overall_passed: null`; an unobserved difference is `null`, not zero. Public reports exclude signatures, raw nonces, private request IDs and contact details. All attempts and intermediate transitions remain in the owner's complete event export. Reports and event exports can be hashed for snapshots; this is an operator-controlled database, not a claim of independently immutable logs.

## Validation performed before funding

- Existing regression tests plus new schedule, quote, retry, restart, pagination and batch decoding cases.
- Real local Redis: 1,000 synthetic records across all ten amounts, exact stage caps, replacement-nonce races, complete export, persistent restarts and unknown recovery. These fixtures never contact a mainnet facilitator and are not published as real payments.
- Next.js production build and type checks.
- Read-only decoder check against the **earlier** real 0.001 USDC batch; separately published as a baseline and excluded from the campaign count.

Primary specifications: [Circle batching](https://developers.circle.com/gateway-nanopayments/concepts/batched-settlement), [seller reconciliation](https://developers.circle.com/gateway-nanopayments/howtos/x402-seller-reconciliation), [SDK](https://developers.circle.com/sdks/gateway-nanopayments-sdk), [Batches.sol](https://github.com/circlefin/evm-gateway-contracts/blob/master/src/modules/wallet/Batches.sol), [BatchedDelta.sol](https://github.com/circlefin/evm-gateway-contracts/blob/master/src/lib/BatchedDelta.sol).

# Mainnet payment reliability campaign

Status updated October 15, 2026 (Asia/Shanghai): all **1,000 payments are chain verified**, totaling **0.232600 USDC** in **32 shared batches**, with **zero atomic-unit wallet difference**. The dated public snapshot has **993/1,000 payment-and-scenario passes**, with seven concurrent-overlap cases still open. [Read-only public evidence](https://radar-agent-ivory.vercel.app/evidence) separates those results and includes its latest reconciliation timestamp.

The owner activated an explicit accelerated timing amendment from payment 332. The original 24-hour schedule was not completed. Operator controls remain at `/validation` and are excluded from main navigation and indexing.

The initial deployment snapshot (`086bfe6`, `dpl_9enbrfFJrFwBc7PRfbjWomXHp2Ci`)
passed nine unsigned online checks on October 13 while its count was still zero.
That historical starting state remains in `validation-deployment-2026-10-13.json`;
it does not describe the current campaign. The live page and durable state
determine actual progress. The earlier 0.001 USDC market-data pilot is a separate
baseline and is excluded from the 1,000-payment target.

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

The original stage-three schedule spaces 900 intents over 24 hours (about 96 seconds per slot). Client concurrency cannot bypass server timing and single-flight guards. The owner can explicitly activate v3's **accelerated timing amendment** for only the remaining unreserved intents: sequential new claims at least five seconds apart. A separate five-minute owner signature binds the runner, original bundle hash and reservation count. Activation is atomic, requires no in-flight payment and preserves the original expiry, budgets, intent/nonce indexes and journals. It cannot silently revise or erase earlier evidence. Old monetary/scenario schedule hashes remain unchanged; timing changes have their own append-only event and authorization digest.

Default execution continues to follow the original schedule. With an amendment, the site and report disclose its timestamp, first affected ordinal, interval, actual observed duration and `original_24h_plan_followed: false`. An accelerated completion must never be described as completion of the original 24-hour plan. The local runner remains awake and Vercel only handles short requests. Interrupted work resumes from the original private journal; multiple runners remain prohibited.

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

On `/validation`, select OKX Wallet or the browser EVM wallet before connecting. Connection status is beside the buttons; open the extension icon if a connection request is pending. A connection timeout never retries automatically and never signs a payment. Account/network changes clear the budget checkbox. “Choose account” and “Disconnect” affect the connection only; they do not erase payment journals, server reservations or existing signed authorizations. If the page remains at “loading connection”, allow site scripts and hard-refresh Chrome.

1. Open `/validation` on the same trusted computer/browser that controls the funded buyer wallet. Select Arc Mainnet (5042), check the displayed buyer and seller, connect, and check the stage budget box.
2. Approve **stage 1: 10 payments / 0.002326 USDC**, then check the box again and run the stage. This uses the existing Gateway balance and needs no deposit if that balance is sufficient. The extension will ask for each payment signature; check the exact amount each time.
3. Run **read-only reconciliation**. It needs a free owner control signature. Wait for Gateway `completed`, a canonical successful batch with three confirmations, decoded net deltas and complete attribution. Do not advance on HTTP 200 alone.
4. Only after the first ten payments reconcile, review optional funding for the remaining stages. The server calculates the unfunded remainder of the 0.232600 USDC campaign, capped at **0.223600 USDC**. Existing funds are reused. No automatic funding occurs.
5. Funding requires a separately reviewed exact ERC-20 approval, a new quote after that approval, and a separate `deposit(USDC, amount)` transaction. Each transaction's gas ceiling is **0.005 native USDC**, combined at most 0.01 USDC. Never use unlimited approval or transfer tokens directly to the Gateway address. The client checks the actual broadcast calldata, wallet, destination, receipt gas and remaining allowance. After a deposit, the allowance must be zero. A pending/unknown transaction must be recovered using its original hash, not resent.
6. Reconcile and approve stages 2 and 3 separately. For 1,000 payments the local runner below avoids 1,000 browser popups, if the owner chooses and configures a local signing adapter. Never put a buyer signing key in Vercel, source control, chat or public exports.
7. Use the page's public JSON/CSV downloads for all report rows. The private wallet-signed export paginates until `next_offset` is null and includes all receipts or append-only events. Each page signature is scoped to the exact URL and expires after five minutes. The original `/billing` newest-100 list is not a complete campaign export.

The browser stores exact signed authorizations in its own local storage before submitting. The CLI uses a private directory and files with permissions 0700/0600, fsync and atomic rename. New campaign authorizations last seven days plus one hour: the extra hour accommodates human review before the remaining validity reaches the batching minimum. The ordinary one-payment pilot keeps its existing timeout policy. Protect this local state and do not share it. Neither version uploads a signing key or stores reusable payment signatures in Redis. Server event records include attempts and transitions, not signatures. Browser reconnects and private-journal edits do not reset server caps.

Stopping the local loop stops subsequent requests. The separately signed **pause** action halts server-side new claims. Neither revokes signatures already created. After all reserved payments reconcile, the owner can sign **resume** within the original approval lifetime; it does not extend the expiry or budget. If a signing result has no recoverable journal, stop and inspect it rather than signing again.

## Explicit recovery of a short-validity rejection

On 2026-10-13, the first two campaign payments (100 and 9 atomic USDC) reached Gateway. The third, 999 atomic USDC, was rejected before reservation/settlement with `authorization_validity_too_short`. The request timing is consistent with interactive signing exhausting the original 100-second buffer; the exact original authorization is rechecked by the recovery endpoint, without asking the owner to disclose its signature. Repeated identical requests remained rejected; they did not create a third Gateway transfer. This observed failure is retained, not counted as a successful payment.

For this specific case, the owner can select **核查并延长原授权（不提交付款）** in the same browser and keep the original local journal. This is an explicit exception to unchanged-authorization replay, never an automatic retry. The read-only recovery endpoint verifies the original owner signature, confirms Gateway currently rejects it specifically for short validity, checks complete transfer history for the nonce, checks both the campaign intent and shared nonce/request reservation indexes twice, and requires an active stage. Existing reservations, any transfer for the nonce, an upstream failure, a different rejection or a still-valid authorization block renewal.

The owner separately consents to extend `validBefore` and personally signs. The nonce, intent, request ID, amount, payer, seller and `validAfter` remain unchanged. The old signed header and failure attempts remain in the private journal; the new pending terms are committed before signing, and the new signature is committed before any submission. The recovery operation does not submit a payment. Unknown signing or storage outcomes block further signing and replay; only an explicit wallet cancellation restores the prior journal. Afterwards the owner can run the existing stage: accepted intents are skipped and the renewed original nonce is submitted once. No reservation or budget is cleared, and no new nonce is generated.

Public reports retain pre-reservation verification rejection counts, known reason codes and renewal-check counts. Older attempts whose reason was not durably recorded remain labelled as such; the current recovery check does not pretend to retroactively attest their bodies. Signed headers stay out of server logs and public exports. A same-nonce expiry revision is disclosed separately from exact-authorization replay tests.

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

Money tolerance is **zero atomic units**; rounding is prohibited. A final pass requires all 1,000 payments verified, no unresolved errors or duplicates, exact matching amounts, all required scenario evidence, at least ten observed spread sessions and adherence to the approved timing policy. The original policy additionally requires the final claim to occur at least 24 hours after stage-three approval; an explicitly amended accelerated run is reported separately with its actual duration and does not satisfy the original 24-hour claim. Partial/pending data has `overall_passed: null`; an unobserved difference is `null`, not zero. Public reports exclude signatures, raw nonces, private request IDs and contact details. All attempts and intermediate transitions remain in the owner's complete event export. Reports and event exports can be hashed for snapshots; this is an operator-controlled database, not a claim of independently immutable logs.

## Validation performed before funding

- Existing regression tests plus new schedule, quote, retry, restart, pagination and batch decoding cases.
- Real local Redis: 1,000 synthetic records across all ten amounts, exact stage caps, replacement-nonce races, complete export, persistent restarts and unknown recovery. These fixtures never contact a mainnet facilitator and are not published as real payments.
- Next.js production build and type checks.
- Read-only decoder check against the **earlier** real 0.001 USDC batch; separately published as a baseline and excluded from the campaign count.

Primary specifications: [Circle batching](https://developers.circle.com/gateway-nanopayments/concepts/batched-settlement), [seller reconciliation](https://developers.circle.com/gateway-nanopayments/howtos/x402-seller-reconciliation), [SDK](https://developers.circle.com/sdks/gateway-nanopayments-sdk), [Batches.sol](https://github.com/circlefin/evm-gateway-contracts/blob/master/src/modules/wallet/Batches.sol), [BatchedDelta.sol](https://github.com/circlefin/evm-gateway-contracts/blob/master/src/lib/BatchedDelta.sol).


## Funding reconciliation and edited-allowance recovery

Funding reconciliation now reads receipts through the seller API, with a bounded request timeout and visible progress next to the funding controls. It verifies the pinned buyer, USDC/Gateway destinations, actual calldata, successful canonical receipts, three confirmations, gas cap, and current allowance. It never broadcasts a transaction. Missing or uncertain evidence keeps the original browser journal reserved.

If the wallet broadcasts an approval amount different from the reviewed quote, that approval cannot unlock a deposit. The owner must first clear the allowance. To recover, supply the original approval hash (or use the saved hash) and the separate, later approve-zero hash in the funding recovery panel. Both transactions must verify and the current allowance must be zero. Only then does the journal enter approval_revoked and permit a fresh exact quote. A deposit can never be reset with an approval revocation. Original approval and revocation evidence remain in the browser history when the owner starts a new approval.

The recovery check does not sign an approval, fund Gateway, advance a campaign stage, or submit a payment. Each money-moving step still requires the owner's explicit wallet confirmation. Wallet approval amounts must exactly match the fresh displayed quote; never choose a maximum or unlimited amount.


## Supplemental concurrency evidence after settlement

If an accepted/completed payment lacks concurrent-attempt evidence, normal Run/Continue skips its accepted browser journal. Use **补做并发验证（不新增付款）** on the original Chrome profile instead. Confirm the designated payer and chain 5042, check the receipt-only consent and run the supplement. It issues two concurrent HTTP reads carrying the exact saved payment header and request ID. It never generates a nonce, invokes a signer, quotes a new payment, reserves money or calls the facilitator. The explicit server replay-only branch requires the matching accepted receipt and response digest; a missing/conflicting record fails closed without falling back to settlement. Original local and server failures remain visible.

After the two responses match the original digest, click **只读核查全部付款与链上批次** and sign the free five-minute owner control message. The reconciler searches all uniquely matched start/finish pairs, including later attempts, for actual overlap in both server timestamps and durable event order. There is no inserted delay or fabricated overlap marker. Supplemental pairs require two successful cached replies. If requests did not overlap, the scenario stays unverified; no charge or new signature is needed to repeat this receipt-only check. A missing original local journal cannot be replaced by a fresh payment.

Public results distinguish chain-verified payments from payments whose scenarios also pass. Rows label supplemental proof as `settled_receipt_replay`, expose the supplemental attempt count and retain original attempts. This tests concurrent receipt retrieval **after settlement**, not a new settlement race. Stage gates still require every prior payment and its scenario evidence to pass. Supplemental HTTP attempts do not change the unique-payment count, amount or batch hashes.


## Owner-run macOS handoff

For stage-three continuation without individual browser prompts, see [the macOS local runner guide](LOCAL_RUNNER_MACOS.md). The owner must prepare the original-browser handoff and personally supply their test-wallet key through hidden local terminal input. The runner preserves existing records, timing, limits and expiry; it does not deposit or approve tokens.


## Complete original-record audit — October 15

The owner downloaded the existing authenticated private receipt and event exports. The local read-only audit individually matched all 1,000 server bills to completed Gateway transfers, additionally compared 900 original local authorizations, and re-read all 32 Arc batches. Exact principal: 0.232600 USDC; principal and batch wallet variance: zero. All 5,507 events were checked, with 1,241 paired HTTP attempts and no unmatched starts. Detailed counts, measured server intervals and cost boundaries are in [MAINNET_AUDIT.md](MAINNET_AUDIT.md). No original authorization or private nonce is published.

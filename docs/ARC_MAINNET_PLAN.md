# Radar Agent — Arc mainnet and ecosystem plan

Updated: 2026-09-16. Repository: https://github.com/CrisChang/radar-agent

This is the Arc **Radar Agent** project, not the Uniswap SwapGuard project.
Owner-approved order: (1) mainnet compatibility, (2) external-agent integration
and real delivery evidence, (3) Microgrants and Marketplace applications.
Tameion is only a candidate until full rules and continuation eligibility are known.

## Current result

**Read-only infrastructure compatibility passed; production payments are NOT enabled.**

- SDK migration: x402-batching 2.1.0 → 3.5.0; App Kit 1.10.0 → 1.15.1;
  Circle Wallets adapter 1.4.3 → 1.8.0. Exact versions and lockfile retained.
- Live RPC returned chain ID 5042 and a recent block. USDC and GatewayWallet
  returned code; ERC-20 USDC decimals were 6 (native gas accounting is 18).
- Gateway's public supported endpoint advertised the Arc mainnet payment kind.
- First diagnostic had a network failure. It remains in `docs/evidence/` alongside
  the successful rerun; do not cherry-pick it out of availability claims.
- Local independent HTTP client passed health → OpenAPI → unpaid 402 checks.
  This is our own integration example, NOT third-party adoption or paid delivery.
- Integration hardening adds D1 request/response persistence, unique request and
  authorization claims, exact accepted-response replay, single-host buyer locking,
  outstanding signal-fee reservations, and guarded paid HTTP transport.
- 42 automated tests are in the current suite, including mocked payment failures
  and real SQLite constraint/restart checks; no mocked acceptance is live evidence.
- The built Worker and D1 adapter also passed an isolated Miniflare/workerd smoke
  test with outbound HTTP disabled. Cloud deployment is still pending.
- No private keys loaded by the diagnostic/probe scripts, no payment signed,
  no transaction broadcast, no mainnet deposit, no application submitted.

Report: [successful mainnet probe](evidence/mainnet-compatibility-2026-09-16T10-14-51-178Z.json).
Earlier result: [partial failure](evidence/mainnet-compatibility-2026-09-16T10-10-06-099Z.json).

## Product scope

Provide agent-consumable ETH/BTC market observations with explicit pricing,
freshness, source, request correlation, payment status and delivery evidence.
The buyer is another agent. The web UI is an inspection/demo surface, not a
manual trading destination. No profit guarantee, calibrated forecast probability,
general trading agent, or full exchange execution is claimed.

Keep three meanings separate:

1. **Payment accepted**: Gateway accepted an authorization and returned a reference.
2. **Content delivered**: buyer received and validated the exact response bytes.
3. **Onchain reconciled**: batch/transaction status and the relevant transfer were
   independently checked. A Gateway UUID is not a transaction hash. A hash-shaped
   string is not, by itself, a verified receipt.

## Gates before any real funds

The `assertExecutionNetwork()` code gate rejects mainnet on both buyer and seller.
Setting `RADAR_NETWORK=mainnet` does not enable payment or treasury movement.

- [x] Verify public network identity and protocol declarations.
- [x] Upgrade and typecheck the SDK integrations without creating wallets.
- [x] Publishable OpenAPI and a no-wallet external HTTP example.
- [x] Fail before payment for invalid queries and stale/unavailable content.
- [x] Label unknown settlement as unsafe to repay automatically.
- [x] D1 seller state and stored-response recovery implemented and locally tested.
  Binding/migration and cloud end-to-end validation are a separate pending gate.
- [x] Persist signal-fee reservations before signing; preserve unknown amounts
  across restart/day rollover. Single-host CLI lock prevents overlapping cycles.
  Multi-host buyers need a shared budget coordinator; legacy state is preserved.
- [x] Paid HTTP refuses redirects, pins the recipient, bounds timeout/body size,
  validates the original quote and verifies output digest, fields and freshness.
- [ ] Operator workflow for resolving unknown Gateway acceptance/batch settlement.
  No automatic reset, expiry or re-payment is allowed on unresolved records.
- [ ] Reconcile real treasury balances and account for gas before sends. A configured
  `TREASURY_AVAILABLE_USDC` is not independently verified live balance evidence.
- [ ] Check App Kit send outcome/receipt before calling it complete. SDK chain enum
  support alone does not establish account entitlement, balance or a successful send.
- [ ] Confirm owner-controlled buyer/seller/treasury addresses and total spending
  limit (service fees + gas + any transferred principal), with explicit approval.
  No existing key or wallet is presumed approved for mainnet use.
- [ ] Stage a separate mainnet deployment/config; preserve testnet proof history.

Default CLI mode now stops after purchasing and validating the signal. Legacy
treasury execution is a separate `--execute-treasury` testnet experiment and is
excluded from the first service-delivery pilot. See [staging runbook](STAGING_AND_PILOT.md).

## Real-delivery acceptance experiment

First run a paid testnet integration; then a separately approved, bounded mainnet
pilot. The test harness may be ours, but label it that way. A real third-party pilot
requires a consenting external agent operator, not another script we call a customer.

Record request ID, run ID, UTC time, caller implementation, network, authorized
amount, actual payment reference, fresh/demo/stale data classification, exact
response digest, client receipt, latency and independently reconciled settlement.
Never export private keys, bearer tokens or reusable payment authorizations.

| Case | Expected result |
|---|---|
| Fresh ETH/BTC observation | Paid response and client-observed digest match |
| Invalid query / unavailable feed | No new payment accepted |
| Wrong network / token / seller / amount | Refuse before signing |
| Same request retried / concurrent duplicate | Durable recovery; no unintended new charge |
| Gateway timeout after submission | Unknown pending cost retained; no blind re-payment |
| Budget exhausted / gas unavailable | Refuse with an explicit reason |
| Demo fixture | Testnet-only, clearly labelled, excluded from live service success metrics |

Report denominators: attempted requests, accepted payments, valid client-received
responses, unknown/failed settlements and retries. Report completion rate, latency,
total cost, cost per valid delivered response and unintended duplicate charges.
Do not turn blocked requests into successful deliveries or call unmeasured gas zero.

## Applications (prepare now; submit only when gates are met)

### Arc Microgrants

Official: https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq
Submission: https://dorahacks.io/hackathon/arc-microgrants

Open 2026-09-16 21:00 Beijing; deadline 2026-10-15 11:59 Beijing
(official deadline October 14 23:59 ET). Rolling review; not guaranteed funding.
20 selected grants of 500 USDC each. A working mainnet project and public repo
are required. Testnet-only work is not eligible. Confirm prior Circle/Arc funding
and applicable verification/jurisdiction rules with the owner before submission.

Draft short description:
> Agent-consumable market signals with USDC per-request payments and auditable delivery on Arc.

Do not submit this as a live-mainnet claim until the real delivery evidence exists.
Attach the live mainnet endpoint/demo, repo, a short explanation of Arc usage,
builder profile and appropriately labelled test report. No invented user numbers.

### Circle Agent Marketplace

Official: https://developers.circle.com/agent-stack/agent-marketplace/get-listed

Requires a working paid endpoint, OpenAPI and confirmed payout address. Listings
are reviewed manually and payout addresses are screened. Our local OpenAPI at
`/api/openapi` is not publicly deployed yet. Prepare metadata and apply only after
the endpoint is reachable, its accepted network is supported and delivery tested.
Approval is not guaranteed; listing does not establish demand or revenue.

### Tameion

https://community.arc.io/public/events/tameion-agents-hackathon-jb1w9clwx7
The calendar lists Sep 27–Oct 10. Prize, full rules, registration details and
existing-project eligibility remain unverified. No registration or commitments made.

## Primary technical references

- https://docs.arc.io/arc/references/connect-to-arc
- https://developers.circle.com/gateway/references/supported-blockchains
- https://developers.circle.com/gateway/references/contract-addresses
- https://developers.circle.com/gateway/nanopayments/quickstarts/seller
- https://developers.circle.com/agent-stack/agent-marketplace/get-listed

Program research is dated; recheck rules at submission. Public documentation and
read-only RPC support do not establish custody-service availability for our account.

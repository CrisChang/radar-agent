# Radar Agent architecture

Updated October 14, 2026. The current mainnet product is a pay-per-query market
data service for agents and developers, with spending checks and recoverable
payment records. It does not place exchange orders, execute mainnet treasury
moves or calculate trading profit and loss. The earlier testnet treasury demo
is a separate optional module.

## Mainnet data and payment path

```text
Agent buyer                         Vercel seller
inspect unpaid 402 quote  <--------  advertise exact USDC price and payment terms
check wallet/network/price/budget
reserve local spending budget
sign exact payment authorization
send original authorization  ---->  verify through Circle Gateway
                                    durable nonce/request claim in Redis
                                    prepare fresh response and response digest
                                    request Gateway settlement
save response and receipt   <----  return accepted payment reference + observation
apply deterministic rule
record decision locally

Circle Gateway accepts the payment, then settles it in a shared Arc batch.
An HTTP success or Gateway acceptance reference is not a confirmed chain hash.
```

### Signal seller

`GET /api/signals/latest?symbol=ETH-USD` supports ETH-USD and BTC-USD observations
at 0.001 USDC per query. `lib/signals.ts` derives a timestamped observation from
public Coinbase Exchange one-minute candles and reports the actual `window_s`.
Its live calculation requires at least three candles; a fixed two-minute demo
fixture is not the production window. Stale, unavailable or future-dated live
data is refused before settlement. Demo fixtures must be explicitly enabled
and labelled; production has them disabled.

Circle Gateway x402 advertises the network, asset, recipient and exact price
in an unpaid HTTP 402 response. The seller retains request/nonce claims and the
prepared paid response in durable Redis. Exact-authorisation recovery returns
the original content rather than substituting a newer market observation.
Unavailable storage fails closed. See [payment recovery](PAYMENT_RECOVERY.md)
for state transitions and unknown outcomes.

### Agent buyer and browser controls

`agent/radar.mts` checks the quote, configured wallet, network, recipient and
spending policy before signing. Authorizations reserve local budget even if an
HTTP acknowledgement is lost. The buyer verifies the delivered response and
records a deterministic hold or suggested-rebalance decision. A rebalance
suggestion is not a mainnet trade or transfer.

`/pilot` provides an owner-operated browser demonstration, while `/billing`
provides wallet-scoped receipt reads and CSV export using a five-minute read-only
signature. These pages support inspection and recovery; the intended API users
are other agents and developers. The fixed one-query owner pilot and its spent
budget remain separate from the reliability campaign.

The local discipline layer implements spending reservations, deterministic
action keys, a circuit breaker and a local JSONL audit. Treasury-only reserve
and balance checks apply to the optional testnet module. These are prototype
software controls, not cryptographic restrictions on a wallet key or a claim
that every possible duplicate, outage or storage failure has been eliminated.

## Separate reliability campaign

`/validation` reports a staged 1,000-payment campaign across ten fixed amount
tiers, totaling 0.232600 USDC before funding gas. Its isolated
`/api/validation/payment` endpoint returns payment-test receipts. These payments
are neither 1,000 market-signal purchases nor exchange trades. Both wallets are
controlled by the owner, so the campaign does not measure customer demand or
independent revenue.

The schedule, stage budgets, durable reservations and original authorizations
bind each intent. Stage three defaults to 900 payments over 24 hours. An explicit owner-signed timing amendment can accelerate remaining new claims to at least five-second spacing; the report discloses the change and cannot claim original 24-hour completion.
An optional owner-run local signer removes repeated browser prompts while
retaining those limits; the key stays on the owner's computer. Vercel handles
individual requests and does not run the 24-hour client loop.

The campaign exercises sequential requests, spread sessions, identical-header
replays, controlled response loss and real client restarts. Reconciliation
matches Gateway records to each payment and independently verifies Arc batch
receipts and aggregate wallet deltas. Multiple payments can share a batch hash.
Per-payment attribution depends on Gateway records; chain evidence independently
proves the batch's aggregate changes, not each offchain authorization.

Public results separate accepted payments, chain-verified payments and scenario
passes. Supplemental concurrent retrieval of an already settled receipt is
labelled `settled_receipt_replay`; it does not prove an initial-settlement race.
Observed failures remain in the record. The campaign is in progress as of this
update, and no final 1,000-payment pass is claimed. See the
[live report](https://radar-agent-ivory.vercel.app/validation) and
[campaign runbook](MAINNET_VALIDATION.md).

## Settlement, trust and costs

- Arc Mainnet uses chain 5042 and USDC for gas. Gateway payment authorizations
  are offchain signatures; funding and other onchain transactions have separate
  gas costs. This is not a zero-fee service claim.
- API acceptance references, Gateway completion, funding transaction hashes and
  verified fee-settlement batch hashes are distinct evidence fields.
- Unknown outcomes retain reservations and require reconciliation or replay of
  the saved original authorization. Recovery does not silently create a new
  nonce or assume that a timeout means no payment occurred.
- Buyer keys remain local. Server storage, provider availability, RPC evidence
  and the owner's private journal are operational dependencies.
- Public reports omit reusable signatures and private request details. Logs and
  snapshots are operator-controlled records, not independently immutable logs.

The October 12 baseline completed one real 0.001 USDC ETH observation purchase
between two distinct owner-controlled wallets, with a matching response digest,
authenticated receipt reads, owner-confirmed CSV export and an independently
checked Arc settlement batch. CSV file contents were not independently inspected.
The [baseline evidence](mainnet-pilot-2026-10-12.json) is retained separately from
the campaign; it is not a production-readiness or customer-revenue claim.

## Historical testnet treasury module

The earlier Encode Club × Circle hackathon prototype uses Circle App Kit Send
to move a capped amount of USDC from a developer-controlled active wallet to a
reserve wallet on Arc Testnet. It requires separate configuration and explicit
treasury permission. Mainnet treasury execution remains disabled.

The original testnet demo, checkpoint deck and September implementation explain
the project's history. They do not document the October mainnet product or
replace its current payment evidence. See [the submission pack](ARC_MICROGRANTS.md)
for the current scope and links.

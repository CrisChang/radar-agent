# Mainnet pilot runbook

Updated October 12, 2026. Public hosting, Free Redis storage, the browser
funding flow and the one-query pilot are ready. All 70 tests and 16 anonymous
cloud checks pass. Owner funding, paid delivery, billing/CSV and subsequent batch settlement
have passed. The one-query budget is spent; do not repeat the purchase. [Current evidence](deployment-public-vercel-2026-10-12.json).

## Owner-confirmed identities and bounded experiment

- Arc Mainnet, chain 5042; gas is native USDC, not ETH or ARC.
- Buyer: `0xefc70a0dedefee6a010bac44de489bafb2fd8422`.
- Recipient: `0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C`; the wallets must differ.
- USDC: `0x3600000000000000000000000000000000000000` (ERC-20 decimals: 6).
- Gateway Wallet: `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`.
- Optional deposit: exactly 0.01 USDC into the buyer's own Gateway balance.
- Approval: exactly 0.01 USDC; no unlimited approval.
- Gas cap: 0.005 USDC per funding transaction, 0.01 USDC for the two steps.
- API fee: one 0.001 USDC query, deducted from Gateway funds.
- No automatic funding, recurring purchases or mainnet treasury execution.

The owner must review this budget and personally confirm wallet transactions.
The server has no buyer signing key. Never put a key or seed phrase in chat.

## Browser sequence for a newly authorized experiment

The October 12 experiment below is already complete. These are operating
instructions, not authorization to repeat it with the spent pilot budget.

1. Open https://radar-agent-ivory.vercel.app/pilot. Connect the approved wallet
   and select Arc Mainnet. Check the displayed recipient and budget.
   If the wrong account connects, use **Disconnect wallet**, then **Choose
   account** to request account access again. Unsupported permission revocation
   is reported explicitly; disconnect this site in the wallet extension if
   necessary. Account/network changes clear consent and quotes, while saved
   payment reservations remain in place to prevent duplicate spending.
2. Check Gateway balance. If at least 0.001 USDC is available, skip funding.
3. If funding is needed, review the funding quote. The first quote simulates
   approval; deposit gas is only a conservative ceiling at this stage.
4. Approve exactly 0.01 USDC in the wallet. After confirmation, review again
   to simulate the deposit. Quotes expire after 60 seconds.
5. Confirm the separate 0.01 USDC deposit in the wallet. Check Gateway balance
   after the confirmed transaction is indexed. Do not use a plain token transfer
   to the Gateway contract.
6. Authorize the single 0.001 USDC purchase. The browser verifies the returned
   signal and response digest. The authorization is valid for approximately
   seven days for Gateway batching; treat it as reusable sensitive data.
7. Read the receipt using the Request ID and export CSV. The read signature
   expires after five minutes and does not authorize spending.
8. If a result is lost, retain the reservation and reconcile. Do not clear
   browser state or sign another purchase. Saved funding hashes can be checked
   through the Reconcile buttons; unresolved outcomes block repeat funding.
9. Independently verify the funding receipt and explorer link. Funding proves
   a deposit, not API-fee settlement. Record Gateway acceptance separately;
   verify a later batch transaction if one is supplied.
10. Finish the mainnet demo and application once actual paid delivery and
    receipt checks pass. Inspect the final application and any terms before
    submission. The October 12 application is already submitted and under review.

## Hosting and submission

Pro Trial ends October 23. The existing local reminder is October 18 at 10:00
Asia/Shanghai. No cancellation or new server purchase has been performed.
DoraHacks requires Telegram plus one backup contact; these private contact
fields must be supplied by the owner, not inferred or committed.

This owner-controlled two-wallet run verifies functionality, not independent demand or revenue.
The product buys public Coinbase observations; exchange-order execution and
trading profit-and-loss accounting remain out of scope.

## Completed October 12 pilot

1. Owner funded Gateway with 0.01 USDC. Funding gas totaled
   0.002956020170266752 USDC, within the reviewed caps.
2. The wallet confirmation had increased the allowance above the requested
   limit. Owner revoked it to zero; RPC verification passed. Revocation gas
   was 0.00066980003576732 USDC. Gateway funds were retained.
3. Earlier payments failed with self_transfer before settlement. Buyer and
   recipient were separated; new reservations bind buyer, recipient and chain,
   while old reservations remain intact.
4. Owner signed one exact 0.001 USDC purchase. The unsigned quote returned 402;
   the signed request returned 200 with a live ETH signal and matching digest.
5. Owner signed a free billing read request and exported CSV. Two production
   billing requests returned 200; exported contents were not independently read.
6. Circle marked the transfer completed. Arc RPC confirmed successful batch
   0xc407227af427e96af16521bff611e6719c68e6e26e6de9eefae8ee642bd7ed41; seller Gateway credit is 0.001 USDC, pending batch zero.

[Redacted evidence](mainnet-pilot-2026-10-12.json) separates funding, immediate
Gateway acceptance and later batch settlement. The billing record retains its
conservative acceptance classification. A UUID is never an explorer hash.

## Recovery and repeat protection

The successful pilot has consumed its one-query budget. Do not sign again,
fund again or clear local storage to make the button available. Use the saved
Request ID with Sign read request for recovery. Read signatures expire after
five minutes and never authorize payment. Do not share them or payment headers.

The project uses an atomic persistent cap across distinct authorizations.
Accepted, settling and unknown outcomes block replacement settlement; migration
honors prior receipts. Rejection before settlement releases the cap. Client
recovery permits only one explicit, consented missing-receipt retry and never
automatically retries a signed payment. Real Redis tests cover concurrency,
restart durability, lost acknowledgements, unknown outcomes and migration.

## Application submitted

Owner-supplied contacts and prior Testnet deployment are filled privately in
DoraHacks. The confirmed batch hash and accurate functional-test disclosure are
included in the application. The owner completed final submission on October 12;
DoraHacks displays Build Submitted and confirms the application is under review.
No selection or grant payment has been reported. An optional mainnet video was
not submitted; never generate another payment merely for recording.

# Mainnet pilot runbook

Updated October 12, 2026. Public hosting, Free Redis storage, the browser
funding flow and the one-query pilot are ready. All 59 tests and 13 anonymous
cloud checks pass. No owner-wallet transaction or paid response has been
verified yet. [Current evidence](deployment-public-vercel-2026-10-12.json).

## Owner-confirmed identities and bounded experiment

- Arc Mainnet, chain 5042; gas is native USDC, not ETH or ARC.
- Buyer and recipient: `0xefc70a0dedefee6a010bac44de489bafb2fd8422`.
- USDC: `0x3600000000000000000000000000000000000000` (ERC-20 decimals: 6).
- Gateway Wallet: `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`.
- Optional deposit: exactly 0.01 USDC into the buyer's own Gateway balance.
- Approval: exactly 0.01 USDC; no unlimited approval.
- Gas cap: 0.005 USDC per funding transaction, 0.01 USDC for the two steps.
- API fee: one 0.001 USDC query, deducted from Gateway funds.
- No automatic funding, recurring purchases or mainnet treasury execution.

The owner must review this budget and personally confirm wallet transactions.
The server has no buyer signing key. Never put a key or seed phrase in chat.

## Browser sequence

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
    submission. The application has not been submitted.

## Hosting and submission

Pro Trial ends October 23. The existing local reminder is October 18 at 10:00
Asia/Shanghai. No cancellation or new server purchase has been performed.
DoraHacks requires Telegram plus one backup contact; these private contact
fields must be supplied by the owner, not inferred or committed.

This same-wallet run verifies functionality, not independent demand or revenue.
The product buys public Coinbase observations; exchange-order execution and
trading profit-and-loss accounting remain out of scope.

## Browser connection verification — October 12

The current deployment detects the dedicated OKX injected provider as well as
the standard EVM provider. Disconnect and account selection are visible on the
public page. The old site connection was revoked in OKX, and a fresh account
access prompt opened in Chrome. The approved pilot account still needs to be
selected by its owner. No wallet signature or financial action was attempted.

Owner-supplied application contacts are filled privately in DoraHacks. Prior
Arc deployment is Testnet, confirmed by the owner. Verified mainnet transaction
evidence and final submission remain pending.

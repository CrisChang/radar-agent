# Mainnet pilot runbook

Updated October 12, 2026. Public hosting, Free Redis storage, the browser
funding flow and the one-query pilot are ready. All 70 tests and 16 anonymous
cloud checks pass. Owner funding is independently verified; a paid response
remains unverified. [Current evidence](deployment-public-vercel-2026-10-12.json).

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

This owner-controlled two-wallet run verifies functionality, not independent demand or revenue.
The product buys public Coinbase observations; exchange-order execution and
trading profit-and-loss accounting remain out of scope.

## Browser connection verification — October 12

The current deployment detects the dedicated OKX injected provider as well as
the standard EVM provider. Disconnect and account selection are visible on the
public page. The old site connection was revoked in OKX, and a fresh account
access prompt opened in Chrome. A subsequent owner-provided screenshot from another computer confirms the
approved account, chain 5042 and checked budget. Funding and paid delivery
remain pending. No wallet signature or financial action was attempted by the agent.

Owner-supplied application contacts are filled privately in DoraHacks. Prior
Arc deployment is Testnet, confirmed by the owner. Verified mainnet transaction
evidence and final submission remain pending.

## Funded pilot and recovery checkpoint

The owner deposit of 0.01 USDC succeeded and Gateway credit is verified.
[Independent chain evidence](mainnet-pilot-2026-10-12.json). Funding gas totaled
0.002956020170266752 USDC, within the original caps. The wallet confirmation
edited approval above the requested amount, and a separate zero-allowance
revoke has now been confirmed by the owner and verified onchain. This revoke never withdraws Gateway
funds, transfers USDC or clears payment reservations. Its extra gas cap is
0.005 USDC, reviewed separately in the browser.

The last observed API attempt returned 402. Refreshing the page does not
reconcile an existing signed authorization. Do not clear browser storage or
authorize a replacement purchase. Reconnect, retain the saved Request ID and
use Sign read request to inspect wallet-scoped billing. Report the result
before deciding whether any new payment can be authorized. Rejected payments
now display bounded reason codes and log only request ID, sanitized reason
and the fact that settlement was not attempted.

## Explicit recovery after the missing receipt

The owner's approve-to-zero transaction succeeded and remaining allowance is
zero. Gateway still has the 0.01 USDC deposit. The authenticated lookup of the
failed request returned 404; this is not a successful payment receipt.

Refresh and reconnect, query the original Request ID with Sign read request,
then review the displayed one-retry consent. Prepare one guarded retry retains
the old request and opens one extra attempt. Recheck the purchase budget and
confirm exactly 0.001 USDC in the wallet. Do not choose a maximum amount or
fund Gateway again. Report the new result/Request ID or full bounded error.

This does not cancel the old signature. The project's mainnet same-wallet
pilot has an atomic persistent cap across different authorizations. Accepted,
settling and unknown outcomes block replacement settlement; migration also
honors pre-existing receipts. Content rejected before settlement releases the
cap. The client permits only one explicit recovery, never an automatic retry.
Real Redis tests cover parallel different nonces, unknown outcomes, release
only before settlement, restart durability and policy migration.

## Definitive rejection reason and corrected next action

The signed request was rejected as self_transfer; settlement was not attempted.
The prior same-address design was invalid for Circle Gateway. It is now
corrected with distinct buyer/recipient roles. The previous failed signatures
pay to the old address and cannot satisfy the new endpoint terms. Old browser
reservations remain intact; new payment reservations bind buyer, recipient and
chain. The durable one-query cap now binds the approved buyer to its recipient.

Refresh the pilot, connect the existing funded buyer and check both displayed
addresses and chain 5042. Approve the purchase budget and personally sign exactly
one 0.001 USDC purchase to the new recipient. No new USDC approval or deposit is
needed. The first unsigned 402 is expected; inspect the final response and the
page's validated signal result. Report the new request/result or bounded reason
code. Paid delivery and wallet billing/CSV remain pending this owner action.

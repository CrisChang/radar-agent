---
name: radar-agent
description: Integrate Radar Agent's paid API on Arc, inspect its quotes and receipt records, and recover an interrupted call using its original authorization. Use for Radar Agent API-payment accounting; not for executing trades or general wallet transfers.
---

# Radar Agent

Make each agent API payment traceable: what it cost, which result arrived, and what happened on retries.

## Start without spending

Service: `https://radar-agent-ivory.vercel.app`.
The working example is an ETH observation at `GET /api/signals/latest?symbol=ETH-USD`.

Read the [integration guide](https://radar-agent-ivory.vercel.app/integrate) and [API schema](https://radar-agent-ivory.vercel.app/api/openapi). Fetch an unpaid quote:

```bash
curl -i 'https://radar-agent-ivory.vercel.app/api/signals/latest?symbol=ETH-USD'
```

HTTP **402 is expected**, not a failed purchase. Decode `payment-required` and report the amount, token, network, recipient and resource to the user. The current service is 0.001 USDC on Arc Mainnet (chain 5042); expected seller: `0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C`. If the quote differs, stop and review the changed terms. Reading this skill is not payment authorization.

For the supported reference client, use the [source repository](https://github.com/CrisChang/radar-agent) on `main`. In a new project directory, clone it, inspect its dependencies, then run:

```bash
npm ci
npm run demo:recovery
npm run agent:call
```

Node.js 22+ is required. `demo:recovery` is offline: three processes, one simulated charge, original-authorization recovery, matching result digest. `agent:call` without flags checks readiness and an unpaid quote. Neither command loads a wallet private key or makes a payment. If needed, the probe accepts `--proxy http://127.0.0.1:<user-provided-port>`; do not guess or change global proxy settings.

## Real purchases and recovery

The current executable payment client is **owner-run**. Provide the [local configuration guide](https://github.com/CrisChang/radar-agent/blob/main/docs/AGENT_INTEGRATION.md) for the owner to configure their own signing key privately and run `npm run agent:call -- --execute` after approving the seller, payer and budget. Do not collect, display or upload keys or reusable payment authorizations. There is no automatic funding or token approval. Installing the skill does not authorize spending.

For a custom integration, inspect [agent-call.ts](https://github.com/CrisChang/radar-agent/blob/main/lib/agent-call.ts) and [the reference entry point](https://github.com/CrisChang/radar-agent/blob/main/examples/external-agent/call.mts). Preserve these invariants:

- Pin quote terms and the exact endpoint before signing. Reserve the software budget first. Local spending caps do not restrict the key's underlying wallet authority.
- One logical purchase has one stable `x-radar-request-id`. Save the original authorization privately **before** submission; send it in `payment-signature` only to the validated origin. Do not forward it on redirects.
- Verify the returned request ID, amount, network, payer, receipt and response SHA-256. Keep the Gateway acceptance reference distinct from a chain transaction hash.
- A timeout or unknown result is not proof of non-payment. Retain the budget reservation and stop new purchases. Reconcile or resume the original request with the original authorization; do not replace the nonce or re-sign to force it through.
- Recovered bytes are the original result, not a fresh market observation. Check the observation timestamp before using it.
- This recovery path requires provider support for idempotency and original-result retrieval. Do not assume it works for arbitrary paid APIs.

## Report the accounting clearly

Report the logical request ID, agreed USDC amount, delivery status, response hash, attempt count and available timing. Label quote/signing/HTTP durations separately. `accepted` means Gateway accepted the payment and the result was saved; it is not independent chain settlement verification. Never substitute zero for an unknown fee or outcome.

For wallet-scoped receipts, use the [billing page](https://radar-agent-ivory.vercel.app/billing) or implement the five-minute read-signature contract in the integration guide. This signature grants receipt reading only. Keep private bills private; public evidence is available without signing at [the evidence page](https://radar-agent-ivory.vercel.app/evidence).

The historical 1,000-payment campaign used owner-controlled payment-test receipts and shared Gateway batches. It is not customer revenue, not 1,000 independent chain transactions, and not proof that the newer SDK was live-tested. Principal reconciliation, shared batch gas, funding gas and infrastructure cost are separate measurements. Preserve these boundaries when summarizing evidence.

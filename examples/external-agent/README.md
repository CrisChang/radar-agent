# Canonical agent entry

```bash
npm run agent:call
```

This checks readiness and the exact 402 quote without a key or payment.
After configuring and approving your own local wallet and budget:

```bash
npm run agent:call -- --execute
```

One durable call, with the exact authorization saved before submission. Repeating the command resumes that call. An explicit `--request-id <UUID>` selects another logical purchase under the daily budget. No automatic funding. Unknown payments stop execution. Retry recovery retains the original identity and authorization. The private journal records quote, signing and HTTP-attempt durations.

Use [the integration guide](../../docs/AGENT_INTEGRATION.md) as the complete contract.
`probe.mts` and `bills.mts` are lower-level discovery and wallet-receipt helpers; they are not alternate recommended starts.

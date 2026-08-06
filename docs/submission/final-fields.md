# Final submission fields

## Detailed explanation

Radar Agent demonstrates a complete two-sided agentic economy on Arc. On the
sell side, a Next.js service turns recent ETH and BTC price movement into a
structured market signal and protects it with a $0.001 USDC Circle Gateway x402
payment requirement. On the buy side, an autonomous agent pays for the signal,
checks freshness and confidence, applies an explainable threshold rule and, when
the rule is satisfied, rebalances a USDC treasury through Circle App Kit.

The build focuses on the custody gap between an agent deciding and an agent
acting. Every money-touching operation passes deterministic controls that the
model cannot override: separate daily spending caps, idempotency keys, minimum
reserve checks, a three-failure circuit breaker and an append-only audit trail.
A stale or unavailable feed always resolves to hold.

The final end-to-end run purchased a real $0.001 x402 signal on Arc Testnet. A
-180 basis-point sharp-drop signal at 0.94 confidence passed all guards and
triggered a 1 USDC transfer from the active treasury wallet to the reserve
wallet. The transfer completed successfully and is publicly verifiable on
ArcScan. The repository includes five deterministic automated tests covering
the Circle adapter, signal calculation, decision rule, safety layer and Gateway
authorization window.

For judging, we deployed a public, non-custodial experience. Reviewers can
verify the live HTTP 402 boundary, replay the recorded execution proof, watch
the demo and open the Arc receipt. Buyer private keys, Circle API credentials
and the Entity Secret remain local and are never shipped to the browser or
stored in the repository.

## Link to Code

<https://github.com/CrisChang/radar-agent>

## Link to Demo Video

<https://radar-agent-arc-2026.chrischang2026.chatgpt.site/demo>

## Link to Presentation

<https://github.com/CrisChang/radar-agent/blob/main/docs/deck.pdf>

## Live Demo Link

<https://radar-agent-arc-2026.chrischang2026.chatgpt.site>

## Track

Agentic Economy Track

## Verified Arc transaction

<https://testnet.arcscan.app/tx/0xb552e86788532a48013355c5165e68bd50b56a24e0dd6ec2a5d28b005e687726>

## Final verification checklist

- Public source repository opens without authentication.
- Live demo loads and reports Arc Testnet.
- `GET /api/health` returns HTTP 200.
- `GET /api/proof` returns the recorded verified execution.
- An unsigned request to `GET /api/signals/latest` returns HTTP 402.
- Demo video contains both a video track and an audio track.
- ArcScan receipt shows the successful Arc Testnet transaction.
- Presentation PDF opens from the public repository.

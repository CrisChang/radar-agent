export const VERIFIED_ARC_PROOF = {
  network: "Arc Testnet",
  chainId: 5042002,
  signal: {
    type: "sharp_drop",
    magnitudeBps: -180,
    confidence: 0.94,
    feedStatus: "demo",
  },
  payment: {
    amountUsdc: 0.001,
    transaction: "164af869-d293-46dc-aaf2-8132bde130a3",
    payer: "0x881ba2701f9260df02a35fb69536397392d633d7",
  },
  decision: {
    action: "rebalance_to_reserve",
    reason:
      "Sharp drop -180 bps with 0.940 confidence meets the 150 bps / 0.90 rule.",
  },
  settlement: {
    amountUsdc: 1,
    transaction:
      "0xb552e86788532a48013355c5165e68bd50b56a24e0dd6ec2a5d28b005e687726",
    explorerUrl:
      "https://testnet.arcscan.app/tx/0xb552e86788532a48013355c5165e68bd50b56a24e0dd6ec2a5d28b005e687726",
    state: "success",
  },
  guards: [
    "data spending cap",
    "treasury spending cap",
    "idempotency",
    "minimum reserve",
    "circuit breaker",
  ],
  verifiedAt: "2026-07-28T14:42:20.661Z",
} as const;


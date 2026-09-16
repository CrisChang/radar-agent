/** Explicit network selection; never infer a payment network from a URL. */
export const ARC_NETWORKS = {
  testnet: {
    name: "Arc Testnet", chainId: 5042002, caip2: "eip155:5042002",
    gatewayChain: "arcTestnet", appKitChain: "Arc_Testnet",
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    nativeDecimals: 18, tokenDecimals: 6,
  },
  mainnet: {
    name: "Arc", chainId: 5042, caip2: "eip155:5042",
    gatewayChain: "arc", appKitChain: "Arc",
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    facilitatorUrl: "https://gateway-api.circle.com",
    usdc: "0x3600000000000000000000000000000000000000",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    nativeDecimals: 18, tokenDecimals: 6,
  },
} as const;

export type ArcNetwork = (typeof ARC_NETWORKS)[keyof typeof ARC_NETWORKS];

export function getArcNetwork(value = process.env.RADAR_NETWORK ?? "testnet"): ArcNetwork {
  if (value !== "testnet" && value !== "mainnet") {
    throw new Error("RADAR_NETWORK must be testnet or mainnet; refusing fallback");
  }
  return ARC_NETWORKS[value];
}

/** Stage-one gate: read-only probes are NOT authority to spend real USDC.
 * Remove only in a reviewed release with durable payment recovery, reconciled
 * balances, a confirmed budget and explicit owner approval. No env bypass.
 */
export function assertExecutionNetwork(network: ArcNetwork): void {
  if (network.chainId !== ARC_NETWORKS.testnet.chainId) {
    throw new Error("MAINNET_EXECUTION_BLOCKED: compatibility checks only; payment recovery and owner-approved funding are required");
  }
}

export function usdcAtomic(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) {
    throw new Error("USDC amount must be a positive decimal with at most 6 decimals");
  }
  const [whole, fraction = ""] = value.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (atomic <= 0n || atomic > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("USDC amount is zero or outside the supported range");
  }
  return atomic.toString();
}

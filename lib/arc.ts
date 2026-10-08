export type ArcNetwork = "testnet" | "mainnet";

const profiles = {
  testnet: {
    name: "Arc Testnet",
    chainId: 5042002,
    gatewayChain: "arcTestnet" as const,
    network: "eip155:5042002" as const,
    rpcUrl: "https://rpc.testnet.arc.io",
    explorerUrl: "https://explorer.testnet.arc.io",
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  },
  mainnet: {
    name: "Arc Mainnet",
    chainId: 5042,
    gatewayChain: "arc" as const,
    network: "eip155:5042" as const,
    rpcUrl: "https://rpc.mainnet.arc.io",
    explorerUrl: "https://explorer.arc.io",
    facilitatorUrl: "https://gateway-api.circle.com",
    gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
  },
};

// Official chain and contract references:
// https://docs.arc.io/arc/references/connect-to-arc
// https://docs.arc.io/arc/references/contract-addresses
export function getArcConfig(env: Record<string, string | undefined> = process.env) {
  const selected = env.ARC_NETWORK ?? "testnet";
  if (selected !== "testnet" && selected !== "mainnet") {
    throw new Error("ARC_NETWORK must be testnet or mainnet");
  }
  return {
    ...profiles[selected],
    mode: selected as ArcNetwork,
    rpcUrl: env.ARC_RPC_URL || profiles[selected].rpcUrl,
    // ERC-20 USDC uses 6 decimals; native gas balances use 18.
    usdc: "0x3600000000000000000000000000000000000000" as const,
    gatewayWallet: profiles[selected].gatewayWallet as `0x${string}`,
  };
}

export type ArcConfig = ReturnType<typeof getArcConfig>;

export function getSellerAddress(env: Record<string, string | undefined> = process.env): `0x${string}` {
  const address = env.SELLER_ADDRESS;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("SELLER_ADDRESS must be a nonzero EVM address");
  }
  return address as `0x${string}`;
}

export function parseUsdcAtomic(price: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(price)) {
    throw new Error("USDC amount must be a decimal with at most 6 fractional digits");
  }
  const [whole, fraction = ""] = price.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (atomic <= 0n || atomic > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("USDC amount must be positive and within the supported range");
  }
  return atomic;
}

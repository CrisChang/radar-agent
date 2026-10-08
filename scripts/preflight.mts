import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { getArcConfig, getSellerAddress, parseUsdcAtomic } from "../lib/arc";

// Read only: no wallet client, signing, approval, deposit or send calls.
try {
  const arc = getArcConfig();
  const seller = getSellerAddress();
  const price = parseUsdcAtomic(process.env.SIGNAL_PRICE_USDC ?? "0.001");
  const client = createPublicClient({
    chain: CHAIN_CONFIGS[arc.gatewayChain].chain,
    transport: http(arc.rpcUrl, { timeout: 10_000, retryCount: 0 }),
  });
  const chainId = await client.getChainId();
  if (chainId !== arc.chainId) throw new Error("RPC chain ID does not match ARC_NETWORK");
  const [usdcCode, gatewayCode, decimals, supported] = await Promise.all([
    client.getCode({ address: arc.usdc }),
    client.getCode({ address: arc.gatewayWallet }),
    client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "decimals" }),
    new BatchFacilitatorClient({ url: arc.facilitatorUrl }).getSupported(),
  ]);
  if (!usdcCode || usdcCode === "0x" || !gatewayCode || gatewayCode === "0x" || decimals !== 6) {
    throw new Error("USDC or Gateway contracts do not match the configured Arc profile");
  }
  if (!supported.kinds.some(k => k.network === arc.network && k.scheme === "exact" && k.extra?.name === "GatewayWalletBatched")) {
    throw new Error("Gateway facilitator does not advertise batching for this Arc network");
  }
  const result: Record<string, unknown> = {
    checked_at: new Date().toISOString(),
    network: arc.name,
    chain_id: chainId,
    seller,
    contracts_verified: true,
    facilitator_supported: true,
    signatures_created: 0,
    transactions_sent: 0,
  };
  const key = process.env.BUYER_PRIVATE_KEY;
  if (key && /^0x[a-fA-F0-9]{64}$/.test(key)) {
    const buyer = privateKeyToAccount(key as `0x${string}`).address;
    const [balance, native] = await Promise.all([
      client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "balanceOf", args: [buyer] }),
      client.getBalance({ address: buyer }),
    ]);
    result.buyer = buyer;
    result.wallet_usdc = formatUnits(balance, 6);
    result.native_usdc = formatUnits(native, 18);
    result.wallet_has_query_amount = balance >= price;
    result.note = "Native and ERC-20 balances are two views of the same USDC; do not add them. Gateway deposit balance is not checked here.";
  } else {
    result.buyer = "not configured";
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // RPC errors may contain authenticated URLs. Do not print raw provider errors.
  const message = error instanceof Error && /^(RPC chain|USDC or Gateway|Gateway facilitator)/.test(error.message)
    ? error.message : "Arc preflight failed. Check the network configuration and RPC/Gateway availability; no funds were moved.";
  console.error(message);
  process.exitCode = 1;
}

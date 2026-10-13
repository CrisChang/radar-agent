import { decodeFunctionData, erc20Abi, formatUnits } from "viem";
import type { ArcConfig } from "./arc";

export const PILOT_DEPOSIT_ATOMIC = 10_000n;
export const PILOT_TX_GAS_CAP = 5_000_000_000_000_000n;
export const gatewayDepositAbi = [{ type: "function", name: "deposit", stateMutability: "nonpayable",
  inputs: [{ name: "token", type: "address" }, { name: "value", type: "uint256" }], outputs: [] }] as const;

export function fundingQuote(arc: ArcConfig, wallet: string, facts: {
  chainId: number; nativeBalance: bigint; allowance: bigint; gasPrice: bigint;
  approvalEstimate?: bigint; depositEstimate?: bigint;
}, now = Date.now(), amountAtomic = PILOT_DEPOSIT_ATOMIC) {
  if (amountAtomic <= 0n || amountAtomic > 223_600n) throw new Error("Funding amount is outside the reviewed maximum.");
  if (arc.mode !== "mainnet" || facts.chainId !== arc.chainId) throw new Error("Gateway funding requires the verified Arc mainnet chain.");
  if (facts.gasPrice <= 0n) throw new Error("Gateway gas quote is unavailable.");
  if (facts.allowance > amountAtomic) throw new Error(`Gateway allowance exceeds ${formatUnits(amountAtomic, 6)} USDC. Revoke the excess allowance before funding.`);
  const approvalNeeded = facts.allowance < amountAtomic;
  const gasPrice = (facts.gasPrice * 3n + 1n) / 2n;
  function limit(estimate: bigint | undefined, maximum: bigint) {
    if (estimate === undefined || estimate <= 0n) throw new Error("Gateway transaction simulation is unavailable.");
    const gas = (estimate * 6n + 4n) / 5n;
    if (gas > maximum || gas * gasPrice > PILOT_TX_GAS_CAP) throw new Error("Gateway gas quote exceeds the 0.005 USDC transaction cap.");
    return gas;
  }
  const approvalGas = approvalNeeded ? limit(facts.approvalEstimate, 100_000n) : 0n;
  // Deposit simulation requires an existing allowance. Quote only a conservative
  // ceiling first; obtain an actual simulation after the separate approval.
  const depositGas = approvalNeeded ? 150_000n : limit(facts.depositEstimate, 150_000n);
  if (depositGas * gasPrice > PILOT_TX_GAS_CAP) throw new Error("Gateway gas quote exceeds the 0.005 USDC transaction cap.");
  const maxGasCost = (approvalGas + depositGas) * gasPrice;
  if (facts.nativeBalance < amountAtomic * 10n ** 12n + maxGasCost) throw new Error("Wallet balance cannot cover the deposit and quoted gas ceilings.");
  return { wallet, network: arc.network, chain_id: arc.chainId, token: arc.usdc, gateway: arc.gatewayWallet,
    amount_atomic: amountAtomic.toString(), amount_usdc: formatUnits(amountAtomic, 6), approval_needed: approvalNeeded,
    gas_price_wei: gasPrice.toString(), approval_gas_limit: approvalGas.toString(), deposit_gas_limit: depositGas.toString(),
    deposit_simulated: !approvalNeeded, maximum_gas_usdc: formatUnits(maxGasCost, 18),
    per_transaction_gas_cap_usdc: "0.005", wallet_usdc: formatUnits(facts.nativeBalance, 18),
    expires_at: now + 60_000, automatic_deposit: false };
}

/** Check what the wallet actually broadcast, since its confirmation UI can edit calldata. */
export function assertFundingTransaction(kind: "approve" | "deposit" | "revoke", arc: ArcConfig, wallet: string,
  tx: { from: string; to: string | null; value: bigint; input: `0x${string}` },
  receipt: { status: string; gasUsed: bigint; effectiveGasPrice: bigint }, amountAtomic = PILOT_DEPOSIT_ATOMIC) {
  const expectedTo = kind === "deposit" ? arc.gatewayWallet : arc.usdc;
  if (receipt.status !== "success" || tx.from.toLowerCase() !== wallet.toLowerCase() ||
      tx.to?.toLowerCase() !== expectedTo.toLowerCase() || tx.value !== 0n ||
      receipt.gasUsed * receipt.effectiveGasPrice > PILOT_TX_GAS_CAP) throw new Error("Gateway transaction does not match the approved wallet, destination or gas cap. Do not retry funding.");
  const call = decodeFunctionData({ abi: kind === "deposit" ? gatewayDepositAbi : erc20Abi, data: tx.input });
  const args = call.args as readonly [string, bigint] | undefined;
  if (call.functionName !== (kind === "deposit" ? "deposit" : "approve") || !args ||
      args[0].toLowerCase() !== (kind === "deposit" ? arc.usdc : arc.gatewayWallet).toLowerCase() ||
      args[1] !== (kind === "revoke" ? 0n : amountAtomic)) {
    throw new Error("Gateway transaction amount differs from the approved amount. Check and revoke excess allowance; do not retry funding.");
  }
}
export type FundingQuote = ReturnType<typeof fundingQuote>;

export function assertFundingQuote(q: FundingQuote, arc: ArcConfig, wallet: string, now = Date.now(), amountAtomic = PILOT_DEPOSIT_ATOMIC) {
  if (q.wallet.toLowerCase() !== wallet.toLowerCase() || q.chain_id !== arc.chainId || q.network !== arc.network ||
      q.token.toLowerCase() !== arc.usdc.toLowerCase() || q.gateway.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
      q.amount_atomic !== amountAtomic.toString() || q.amount_usdc !== formatUnits(amountAtomic, 6) ||
      !Number.isFinite(q.expires_at) || q.expires_at <= now || q.expires_at > now + 60_000) throw new Error("Gateway quote changed or expired. Review a fresh quote.");
  for (const gas of [q.approval_gas_limit, q.deposit_gas_limit]) {
    if (!/^\d+$/.test(gas) || !/^\d+$/.test(q.gas_price_wei) || BigInt(q.gas_price_wei) <= 0n ||
      BigInt(gas) > 150_000n || BigInt(gas) * BigInt(q.gas_price_wei) > PILOT_TX_GAS_CAP) throw new Error("Gateway quote exceeds the approved gas cap.");
  }
}

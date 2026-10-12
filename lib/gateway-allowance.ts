import { formatUnits } from "viem";
import type { ArcConfig } from "./arc";
import { PILOT_DEPOSIT_ATOMIC, PILOT_TX_GAS_CAP } from "./gateway-funding";

export function allowanceQuote(arc: ArcConfig, wallet: string, facts: {
  chainId: number; allowance: bigint; nativeBalance: bigint; gasPrice: bigint; revokeEstimate?: bigint;
}, now = Date.now()) {
  if (arc.mode !== "mainnet" || facts.chainId !== arc.chainId || facts.allowance < 0n || facts.gasPrice <= 0n) throw new Error("Gateway allowance cannot be verified on the required chain.");
  const gasPrice = (facts.gasPrice * 3n + 1n) / 2n;
  let gas = 0n;
  if (facts.allowance > 0n) {
    if (!facts.revokeEstimate || facts.revokeEstimate <= 0n) throw new Error("Gateway revoke simulation is unavailable.");
    gas = (facts.revokeEstimate * 6n + 4n) / 5n;
    if (gas > 100_000n || gas * gasPrice > PILOT_TX_GAS_CAP || facts.nativeBalance < gas * gasPrice) throw new Error("Gateway revoke gas exceeds the 0.005 USDC cap or wallet balance.");
  }
  return { wallet, network: arc.network, chain_id: arc.chainId, token: arc.usdc, gateway: arc.gatewayWallet,
    allowance_atomic: facts.allowance.toString(), allowance_usdc: formatUnits(facts.allowance, 6),
    exceeds_pilot_limit: facts.allowance > PILOT_DEPOSIT_ATOMIC,
    revoke_amount_atomic: "0", gas_price_wei: gasPrice.toString(), revoke_gas_limit: gas.toString(),
    maximum_gas_usdc: formatUnits(gas * gasPrice, 18), per_transaction_gas_cap_usdc: "0.005",
    expires_at: now + 60_000 };
}
export type AllowanceQuote = ReturnType<typeof allowanceQuote>;
export function assertAllowanceQuote(q: AllowanceQuote, arc: ArcConfig, wallet: string, now = Date.now()) {
  if (q.wallet.toLowerCase() !== wallet.toLowerCase() || q.network !== arc.network || q.chain_id !== arc.chainId ||
      q.token.toLowerCase() !== arc.usdc.toLowerCase() || q.gateway.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
      !/^\d+$/.test(q.allowance_atomic) || BigInt(q.allowance_atomic) <= 0n || q.revoke_amount_atomic !== "0" ||
      !/^\d+$/.test(q.revoke_gas_limit) || BigInt(q.revoke_gas_limit) <= 0n || BigInt(q.revoke_gas_limit) > 100_000n ||
      !/^\d+$/.test(q.gas_price_wei) || BigInt(q.gas_price_wei) <= 0n || BigInt(q.revoke_gas_limit) * BigInt(q.gas_price_wei) > PILOT_TX_GAS_CAP ||
      !Number.isFinite(q.expires_at) || q.expires_at <= now || q.expires_at > now + 60_000) throw new Error("Gateway revoke quote changed or expired. Review allowance again.");
}

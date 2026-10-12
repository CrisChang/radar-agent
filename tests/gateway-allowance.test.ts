import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, erc20Abi } from "viem";
import { getArcConfig } from "../lib/arc";
import { allowanceQuote, assertAllowanceQuote } from "../lib/gateway-allowance";
import { assertFundingTransaction, fundingQuote, gatewayDepositAbi } from "../lib/gateway-funding";
const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
const wallet = "0xefc70a0dedefee6a010bac44de489bafb2fd8422" as const;
const facts = { chainId: 5042, allowance: 507024290405517n, nativeBalance: 10n ** 19n, gasPrice: 20_000_000_000n, revokeEstimate: 40_000n };
const receipt = { status: "success", gasUsed: 40_000n, effectiveGasPrice: 20_000_000_000n };
function approval(amount: bigint) { return { from: wallet, to: arc.usdc, value: 0n, input: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, amount] }) }; }
test("oversized allowance is reported and never accepted for further pilot funding", () => {
  const q = allowanceQuote(arc, wallet, facts, 1000);
  assert.equal(q.allowance_usdc, "507024290.405517");
  assert.equal(q.exceeds_pilot_limit, true);
  assert.equal(q.revoke_amount_atomic, "0");
  assertAllowanceQuote(q, arc, wallet, 1001);
  assert.throws(() => fundingQuote(arc, wallet, { ...facts, depositEstimate: 100_000n }));
});
test("revoke refuses altered amount, chain, spender, expiry and excessive gas", () => {
  const q = allowanceQuote(arc, wallet, facts, 1000);
  for (const change of [{ revoke_amount_atomic: "1" }, { chain_id: 1 }, { gateway: wallet }, { expires_at: 1000 }, { revoke_gas_limit: "100001" }, { gas_price_wei: "2000000000000" }]) assert.throws(() => assertAllowanceQuote({ ...q, ...change }, arc, wallet, 1001));
  for (const change of [{ chainId: 1 }, { revokeEstimate: undefined }, { gasPrice: 200_000_000_000n }, { nativeBalance: 1n }]) assert.throws(() => allowanceQuote(arc, wallet, { ...facts, ...change }));
  const zero = allowanceQuote(arc, wallet, { ...facts, allowance: 0n, revokeEstimate: undefined }, 1000);
  assert.equal(zero.revoke_gas_limit, "0");
  assert.throws(() => assertAllowanceQuote(zero, arc, wallet, 1001));
});
test("receipt reconciliation catches wallet-edited approval calldata despite successful mining", () => {
  assertFundingTransaction("approve", arc, wallet, approval(10000n), receipt);
  assertFundingTransaction("revoke", arc, wallet, approval(0n), receipt);
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, approval(507024290415517n), receipt));
  assert.throws(() => assertFundingTransaction("revoke", arc, wallet, approval(1n), receipt));
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, { ...approval(10000n), from: arc.usdc }, receipt));
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, { ...approval(10000n), value: 1n }, receipt));
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, approval(10000n), { ...receipt, status: "reverted" }));
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, approval(10000n), { ...receipt, effectiveGasPrice: 200_000_000_000n }));
  const deposit = { from: wallet, to: arc.gatewayWallet, value: 0n, input: encodeFunctionData({ abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, 10000n] }) };
  assertFundingTransaction("deposit", arc, wallet, deposit, receipt);
  assert.throws(() => assertFundingTransaction("deposit", arc, wallet, { ...deposit, input: encodeFunctionData({ abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, 10001n] }) }, receipt));
});

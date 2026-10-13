import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, erc20Abi } from "viem";
import { getArcConfig } from "../lib/arc";
import { fundingQuote, assertFundingQuote, assertFundingTransaction } from "../lib/gateway-funding";
import { walletRejected } from "../lib/wallet-rejection";
const arc = getArcConfig({ ARC_NETWORK: "mainnet" }), wallet = "0x2222222222222222222222222222222222222222";
test("remaining-campaign funding is bounded at 0.2236 USDC and cannot change the ordinary pilot quote", () => {
  const facts = { chainId: 5042, nativeBalance: 1_000_000_000_000_000_000n, allowance: 0n, gasPrice: 1_000_000_000n, approvalEstimate: 50_000n };
  const now = Date.now(), q = fundingQuote(arc, wallet, facts, now, 223_600n);
  assert.equal(q.amount_atomic, "223600"); assert.equal(q.amount_usdc, "0.2236");
  assertFundingQuote(q, arc, wallet, now, 223_600n);
  assert.throws(() => assertFundingQuote(q, arc, wallet, now));
  for (const amount of [0n, -1n, 223_601n]) assert.throws(() => fundingQuote(arc, wallet, facts, now, amount));
  assert.throws(() => fundingQuote(arc, wallet, { ...facts, allowance: 223_601n }, now, 223_600n));
});
test("edited unlimited allowance is detected in the actual remaining-campaign transaction", () => {
  const tx = (amount: bigint) => ({ from: wallet, to: arc.usdc, value: 0n,
    input: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, amount] }) });
  const receipt = { status: "success", gasUsed: 50_000n, effectiveGasPrice: 1_000_000_000n };
  assertFundingTransaction("approve", arc, wallet, tx(223_600n), receipt, 223_600n);
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, tx(2n ** 256n - 1n), receipt, 223_600n));
  assert.throws(() => assertFundingTransaction("approve", arc, wallet, tx(223_600n), { ...receipt, effectiveGasPrice: 1_000_000_000_000n }, 223_600n));
});
test("only explicit nested wallet rejection is known not to have returned a signature", () => {
  assert.equal(walletRejected({ cause: { cause: { code: 4001 } } }), true);
  assert.equal(walletRejected({ code: 500, message: "network unknown" }), false);
});

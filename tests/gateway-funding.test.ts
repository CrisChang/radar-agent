import assert from "node:assert/strict";
import test from "node:test";
import { getArcConfig } from "../lib/arc";
import { assertFundingQuote, fundingQuote, type FundingQuote } from "../lib/gateway-funding";
const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
const wallet = "0xefc70a0dedefee6a010bac44de489bafb2fd8422" as const;
const facts = { chainId: 5042, nativeBalance: 10n ** 19n, allowance: 0n, gasPrice: 20_000_000_000n, approvalEstimate: 50_000n };
test("funding separates exact approval from a simulated deposit and bounds gas", () => {
  const approval = fundingQuote(arc, wallet, facts, 1000);
  assert.equal(approval.amount_atomic, "10000");
  assert.equal(approval.deposit_simulated, false);
  assert.equal(approval.maximum_gas_usdc, "0.0063");
  assertFundingQuote(approval, arc, wallet, 1001);
  const deposit = fundingQuote(arc, wallet, { ...facts, allowance: 10000n, depositEstimate: 100000n }, 1000);
  assert.equal(deposit.approval_needed, false);
  assert.equal(deposit.deposit_simulated, true);
  assert.equal(deposit.maximum_gas_usdc, "0.0036");
});
test("funding refuses wrong chains, high gas, missing simulation and insufficient gas funds", () => {
  for (const change of [{ chainId: 1 }, { gasPrice: 100_000_000_000n }, { approvalEstimate: undefined }, { nativeBalance: 10_000_000_000_000_000n }]) {
    assert.throws(() => fundingQuote(arc, wallet, { ...facts, ...change }));
  }
});
test("client refuses a stale or tampered funding quote before wallet invocation", () => {
  const q = fundingQuote(arc, wallet, facts, 1000);
  assert.throws(() => assertFundingQuote(q, arc, wallet, 61000));
  for (const change of ([{ amount_atomic: "1000000" }, { gateway: wallet }, { gas_price_wei: "1000000000000" }, { wallet: arc.usdc }, { deposit_gas_limit: "999999" }] as Partial<FundingQuote>[])) {
    assert.throws(() => assertFundingQuote({ ...q, ...change }, arc, wallet, 1001));
  }
});

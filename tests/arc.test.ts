import assert from "node:assert/strict";
import test from "node:test";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { assertDistinctPaymentParties, getArcConfig, getPilotBuyerAddress, parseUsdcAtomic, pilotBudgetKey } from "../lib/arc";

test("both Arc profiles match Circle SDK chain IDs and contract addresses", () => {
  for (const mode of ["mainnet", "testnet"] as const) {
    const arc = getArcConfig({ ARC_NETWORK: mode });
    const sdk = CHAIN_CONFIGS[arc.gatewayChain];
    assert.equal(arc.chainId, sdk.chain.id);
    assert.equal(arc.usdc.toLowerCase(), sdk.usdc.toLowerCase());
    assert.equal(arc.gatewayWallet.toLowerCase(), sdk.gatewayWallet.toLowerCase());
    assert.equal(sdk.chain.testnet === true, mode === "testnet");
  }
});

test("invalid network fails rather than silently falling back to testnet", () => {
  assert.throws(() => getArcConfig({ ARC_NETWORK: "production" }));
  assert.equal(getArcConfig({}).mode, "testnet");
});

test("USDC prices cannot round to zero or lose precision", () => {
  assert.equal(parseUsdcAtomic("0.001"), 1000n);
  assert.equal(parseUsdcAtomic("0.000001"), 1n);
  for (const invalid of ["0", "0.0000001", "-1", "1e-3", "NaN", "1.1234567", "9007199254.740992"]) {
    assert.throws(() => parseUsdcAtomic(invalid));
  }
});
test("pilot buyer is independent of seller and self-payments fail before wallet use", () => {
  const buyer = "0xefc70a0dedefee6a010bac44de489bafb2fd8422";
  const seller = "0x2222222222222222222222222222222222222222";
  assert.equal(getPilotBuyerAddress({ SELLER_ADDRESS: seller, PILOT_BUYER_ADDRESS: buyer }), buyer);
  assert.equal(getPilotBuyerAddress({ SELLER_ADDRESS: seller }), seller);
  assertDistinctPaymentParties(buyer, seller);
  assert.throws(() => assertDistinctPaymentParties(buyer, `0x${buyer.slice(2).toUpperCase()}`), /self_transfer/);
  assert.throws(() => getPilotBuyerAddress({ SELLER_ADDRESS: seller, PILOT_BUYER_ADDRESS: "" }));
  assert.throws(() => getPilotBuyerAddress({ SELLER_ADDRESS: seller, PILOT_BUYER_ADDRESS: `0x${"0".repeat(40)}` }));
});
test("browser payment reservations are bound to buyer, recipient and chain without deleting old reservations", () => {
  const buyer = "0x1111111111111111111111111111111111111111";
  const seller = "0x2222222222222222222222222222222222222222";
  const original = pilotBudgetKey(5042, buyer, seller);
  assert.notEqual(original, pilotBudgetKey(5042, buyer, "0x3333333333333333333333333333333333333333"));
  assert.notEqual(original, pilotBudgetKey(5042002, buyer, seller));
  assert.throws(() => pilotBudgetKey(5042, buyer, buyer), /self_transfer/);
});

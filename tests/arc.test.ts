import assert from "node:assert/strict";
import test from "node:test";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { getArcConfig, parseUsdcAtomic } from "../lib/arc";

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

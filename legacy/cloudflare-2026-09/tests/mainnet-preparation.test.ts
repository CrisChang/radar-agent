import assert from "node:assert/strict";
import test from "node:test";
import { ARC_NETWORKS, assertExecutionNetwork, getArcNetwork, usdcAtomic } from "../lib/network";
import { assertUnchangedOffer, classifyPaymentReference, validateOffer } from "../lib/agent-contract";
import { buildOpenApi } from "../lib/openapi";
import { BatchEvmScheme, CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { Blockchain } from "@circle-fin/app-kit";

const network = ARC_NETWORKS.testnet;
const offer = {
  scheme: "exact", network: network.caip2, asset: network.usdc, amount: "1000",
  payTo: "0x1111111111111111111111111111111111111111",
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: network.gatewayWallet },
};
const challenge = (overrides = {}) => ({ x402Version: 2, accepts: [{ ...offer, ...overrides }] });

test("network typo cannot silently fall back to testnet", () => {
  assert.equal(getArcNetwork("mainnet").chainId, 5042);
  assert.equal(getArcNetwork("testnet").chainId, 5042002);
  assert.throws(() => getArcNetwork("mainent"), /refusing fallback/);
  assert.throws(() => getArcNetwork(""), /refusing fallback/);
});
test("mainnet execution stays blocked even after SDK migration", () => {
  assert.doesNotThrow(() => assertExecutionNetwork(network));
  assert.throws(() => assertExecutionNetwork(ARC_NETWORKS.mainnet), /MAINNET_EXECUTION_BLOCKED/);
});
test("upgraded SDK definitions agree with the audited chain and contracts", () => {
  assert.equal(CHAIN_CONFIGS.arc.chain.id, 5042);
  assert.equal(CHAIN_CONFIGS.arc.usdc.toLowerCase(), ARC_NETWORKS.mainnet.usdc.toLowerCase());
  assert.equal(CHAIN_CONFIGS.arc.gatewayWallet.toLowerCase(), ARC_NETWORKS.mainnet.gatewayWallet.toLowerCase());
  assert.equal(Blockchain.Arc, "Arc");
});
test("USDC prices use exact six-decimal units, not floating-point rounding", () => {
  assert.equal(usdcAtomic("0.001"), "1000");
  assert.equal(usdcAtomic("0.000001"), "1");
  assert.equal(usdcAtomic("12.345678"), "12345678");
  for (const amount of ["0", "-1", "1e-3", "0.0000001", "NaN", "Infinity", " 1", "01", "9007199255"]) {
    assert.throws(() => usdcAtomic(amount));
  }
});
test("external agent rejects cross-chain offers and excessive prices", () => {
  assert.equal(validateOffer(challenge(), network).amountAtomic, "1000");
  assert.throws(() => validateOffer(challenge(), ARC_NETWORKS.mainnet), /cross-network/);
  for (const amount of ["0", "-1", "1001", "1e3", "0001"]) {
    assert.throws(() => validateOffer(challenge({ amount }), network), /offer/);
  }
});
test("external agent rejects token, seller and signing-domain substitution", () => {
  assert.throws(() => validateOffer(challenge({ asset: offer.payTo }), network), /asset/);
  assert.throws(() => validateOffer(challenge({ payTo: "0x" + "0".repeat(40) }), network), /seller/);
  assert.throws(() => validateOffer(challenge({ extra: { ...offer.extra, verifyingContract: ARC_NETWORKS.mainnet.gatewayWallet } }), network), /domain/);
  assert.throws(() => validateOffer({ x402Version: 1, accepts: [offer] }, network), /Unsupported/);
});
test("SDK signing boundary refuses a changed quote before calling any signer", async () => {
  let signingCalls = 0;
  const scheme = new BatchEvmScheme({
    address: "0x1111111111111111111111111111111111111111",
    async signTypedData() { signingCalls++; throw new Error("Mock signer must never be reached"); },
  });
  const approved = validateOffer(challenge(), network);
  scheme.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    assertUnchangedOffer(selectedRequirements, approved, network);
  });
  const initial = { ...offer, maxTimeoutSeconds: 604900 };
  for (const changed of [
    { ...initial, amount: "1001" },
    { ...initial, amount: "999" },
    { ...initial, payTo: "0x2222222222222222222222222222222222222222" },
    { ...initial, network: ARC_NETWORKS.mainnet.caip2 },
    { ...initial, extra: { ...initial.extra, verifyingContract: ARC_NETWORKS.mainnet.gatewayWallet } },
  ]) {
    await assert.rejects(scheme.createPaymentPayload(2, changed), /offer|quote|domain|cross-network/);
  }
  assert.equal(signingCalls, 0);
  assert.doesNotThrow(() => assertUnchangedOffer(initial, approved, network));
});
test("Gateway IDs and even transaction hashes are not declared onchain verified", () => {
  assert.equal(classifyPaymentReference("a-gateway-reference").referenceKind, "gateway_reference");
  assert.equal(classifyPaymentReference("0x" + "a".repeat(64)).referenceKind, "unverified_transaction_hash");
  assert.equal(classifyPaymentReference("0x" + "a".repeat(64)).onchainVerified, false);
});
test("OpenAPI documents the paid endpoint, boundaries, and output schema", () => {
  const spec = buildOpenApi();
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec["x-radar-network"].mainnetExecutionEnabled, false);
  assert.ok(spec.paths["/api/signals/latest"].get.responses["402"]);
  assert.ok(spec.paths["/api/signals/latest"].get.responses["502"]);
  assert.ok(spec.components.schemas.PriceSignal.required.includes("feed_status"));
});

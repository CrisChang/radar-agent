import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { discoverSignal, paySignal, signalEndpoint, validateSignal } from "../lib/agent-http";
import { ARC_NETWORKS } from "../lib/network";
import { buildDemoSignal } from "../lib/signals";
import type { BatchEvmScheme } from "@circle-fin/x402-batching/client";

const network = ARC_NETWORKS.testnet;
const seller = "0x1111111111111111111111111111111111111111";
const requestId = "11111111-1111-4111-8111-111111111111";
const selected = { scheme: "exact", network: network.caip2, asset: network.usdc, amount: "1000", payTo: seller,
  maxTimeoutSeconds: 604900, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: network.gatewayWallet } };
const challenge = { x402Version: 2, resource: { url: "/api/signals/latest", mimeType: "application/json" }, accepts: [selected] };
const header = (data: unknown) => Buffer.from(JSON.stringify(data)).toString("base64");
const offerFetch: typeof fetch = async (_url, init) => {
  assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
  return new Response("{}", { status: 402, headers: { "payment-required": header(challenge) } });
};
const creator: Pick<BatchEvmScheme, "createPaymentPayload"> = {
  // Deliberately invalid fixture signature; no cryptographic signing takes place.
  async createPaymentPayload() { return { x402Version: 2, payload: { signature: "0x00",
    authorization: { from: seller, to: seller, value: "1000", validAfter: "0", validBefore: "1", nonce: ("0x" + "1".repeat(64)) as `0x${string}` } } }; },
};
async function quote() { return discoverSignal(signalEndpoint("http://localhost:3000", true), network, seller, "1000", requestId, offerFetch); }
function paidResponse(body: string, overrides: Record<string, string> = {}) {
  return new Response(body, { headers: {
    "x-radar-request-id": requestId,
    "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"),
    "x-radar-payment-state": "gateway_accepted_not_onchain_verified",
    "payment-response": header({ success: true, network: network.caip2, payer: seller, transaction: "fixture-gateway-id" }), ...overrides,
  } });
}
test("client requires secure transport and an explicitly approved seller", async () => {
  assert.throws(() => signalEndpoint("http://external.example"), /HTTPS/);
  assert.throws(() => signalEndpoint("https://user:password@example.com"), /credentials/);
  assert.equal(signalEndpoint("https://example.com/path").origin, "https://example.com");
  await assert.rejects(discoverSignal(signalEndpoint("https://example.com"), network, "", "1000", requestId, offerFetch), /seller/);
  await assert.rejects(discoverSignal(signalEndpoint("https://example.com"), network, "0x" + "2".repeat(40), "1000", requestId, offerFetch), /approved/);
});
test("paid transport refuses redirects, uses one authorization, and validates received bytes", async () => {
  const q = await quote(); let calls = 0;
  const result = await paySignal(signalEndpoint("http://localhost:3000", true), network, q, requestId, creator, async (_url, init) => {
    calls++; assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).get("x-radar-request-id"), requestId);
    return paidResponse(JSON.stringify(buildDemoSignal()));
  });
  assert.equal(calls, 1); assert.equal(result.amountUsdc, 0.001);
  assert.equal(result.signal.feed_status, "demo");
});
test("unknown or failed paid HTTP never creates an automatic retry", async () => {
  const q = await quote(); let calls = 0;
  await assert.rejects(paySignal(signalEndpoint("http://localhost:3000"), network, q, requestId, creator, async () => {
    calls++; return new Response("unknown", { status: 502 });
  }), /do not repay/);
  assert.equal(calls, 1);
});
test("even a direct library caller cannot sign or pay on mainnet", async () => {
  let calls = 0;
  await assert.rejects(paySignal(signalEndpoint("https://example.com"), ARC_NETWORKS.mainnet, await quote(), requestId,
    { async createPaymentPayload() { calls++; throw new Error("must not sign"); } }), /MAINNET_EXECUTION_BLOCKED/);
  assert.equal(calls, 0);
});
test("client rejects response substitution and wrong network payment metadata", async () => {
  const q = await quote(); const body = JSON.stringify(buildDemoSignal());
  const variants: Record<string, string>[] = [
    { "x-radar-response-sha256": "0".repeat(64) },
    { "x-radar-request-id": "another-request" },
    { "payment-response": header({ success: true, network: "eip155:5042", payer: seller, transaction: "ref" }) },
  ];
  for (const overrides of variants) {
    await assert.rejects(paySignal(signalEndpoint("http://localhost:3000", true), network, q, requestId, creator, async () => paidResponse(body, overrides)));
  }
});
test("stale, wrong-symbol, malformed and unrequested demo signals are not valid deliveries", () => {
  const valid = { ...buildDemoSignal(), feed_status: "live" as const };
  assert.equal(validateSignal(valid, "ETH-USD", false).symbol, "ETH-USD");
  for (const invalid of [null, { ...valid, price: NaN }, { ...valid, symbol: "BTC-USD" },
    { ...valid, feed_status: "stale" }, { ...valid, ts: "2020-01-01" }, { ...valid, feed_status: "demo" }]) {
    assert.throws(() => validateSignal(invalid, "ETH-USD", false));
  }
});

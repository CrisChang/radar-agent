import assert from "node:assert/strict";
import test from "node:test";
import { getArcConfig } from "../lib/arc";
import { buildPaymentRequirements } from "../lib/x402";
import { discoverSignal, paySignal, signalEndpoint } from "../lib/agent-http";
import { encodeProtocolJson, responseDigest } from "../lib/protocol";
process.env.ARC_NETWORK = "mainnet";
process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
const arc = getArcConfig(); const seller = process.env.SELLER_ADDRESS!;
const id = "11111111-1111-4111-8111-111111111111";
const endpoint = signalEndpoint("https://radar.example");
const challenge = () => ({ x402Version: 2, resource: { url: endpoint.toString() }, accepts: [buildPaymentRequirements("0.001")] });
async function quote() { return discoverSignal(endpoint, arc, seller, "1000", id, async () => new Response("{}", { status: 402, headers: { "payment-required": encodeProtocolJson(challenge()) } })); }
function creator(counter: { signed: number }): Parameters<typeof paySignal>[4] {
  return { async createPaymentPayload() { counter.signed++; return { x402Version: 2, payload: {
    authorization: { from: seller as `0x${string}`, to: seller as `0x${string}`, value: "1000", validAfter: "0", validBefore: "9999999999", nonce: `0x${"1".repeat(64)}` },
    signature: `0x${"11".repeat(65)}` } }; } };
}
async function delivery(overrides: { payer?: string; network?: string; digest?: string; ts?: string } = {}) {
  const body = JSON.stringify({ signal_id: "explicit-synthetic-fixture", ts: overrides.ts ?? new Date().toISOString(), symbol: "ETH-USD", type: "stable", magnitude_bps: 0, window_s: 120, confidence: .9, price: 100, reference_price: 100, source: "explicit-test-fixture", feed_status: "live" });
  return new Response(body, { headers: { "x-radar-request-id": id,
    "x-radar-response-sha256": overrides.digest ?? await responseDigest(body),
    "x-radar-payment-state": "gateway_accepted_not_onchain_verified",
    "payment-response": encodeProtocolJson({ success: true, transaction: "explicit-synthetic-reference", network: overrides.network ?? arc.network, payer: overrides.payer ?? seller }) } });
}
test("agent refuses credential URLs and non-HTTPS remote endpoints", () => {
  assert.throws(() => signalEndpoint("https://user:secret@radar.example"));
  assert.throws(() => signalEndpoint("http://radar.example"));
  assert.equal(signalEndpoint("http://127.0.0.1:3000").protocol, "http:");
});
test("discovery pins the resource URL and seller before any signature", async () => {
  for (const altered of [{ ...challenge(), resource: { url: "https://other.example/api/signals/latest" } },
    { ...challenge(), accepts: [{ ...buildPaymentRequirements("0.001"), payTo: "0x2222222222222222222222222222222222222222" }] }]) {
    await assert.rejects(discoverSignal(endpoint, arc, seller, "1000", id, async () => new Response("{}", { status: 402, headers: { "payment-required": encodeProtocolJson(altered) } })));
  }
});
test("changed quote is refused before creating a payment authorization", async () => {
  const q = await quote(); q.selected.amount = "2000";
  const counter = { signed: 0 };
  await assert.rejects(paySignal(endpoint, arc, q, id, creator(counter), async () => delivery()));
  assert.equal(counter.signed, 0);
});
test("validated delivery binds the wallet, request, network and exact signal bytes", async () => {
  const counter = { signed: 0 }; let requests = 0;
  const result = await paySignal(endpoint, arc, await quote(), id, creator(counter), async (_url, init) => {
    requests++; assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("x-radar-request-id"), id);
    return delivery();
  });
  assert.equal(result.signal.signal_id, "explicit-synthetic-fixture");
  assert.equal(result.amountUsdc, .001); assert.equal(counter.signed, 1); assert.equal(requests, 1);
});
test("wrong payer, wrong network, changed bytes and stale replay are refused", async () => {
  for (const overrides of [{ payer: "0x2222222222222222222222222222222222222222" }, { network: "eip155:5042002" },
    { digest: "0".repeat(64) }, { ts: "2020-01-01T00:00:00.000Z" }]) {
    await assert.rejects(paySignal(endpoint, arc, await quote(), id, creator({ signed: 0 }), async () => delivery(overrides)));
  }
});
test("an uncertain HTTP result never causes automatic authorization replacement or replay", async () => {
  const counter = { signed: 0 }; let requests = 0;
  await assert.rejects(paySignal(endpoint, arc, await quote(), id, creator(counter), async () => { requests++; throw new Error("synthetic lost HTTP response"); }));
  assert.equal(counter.signed, 1); assert.equal(requests, 1);
});
test("a rejected payment displays a bounded reason without retrying or exposing raw response data", async () => {
  const counter = { signed: 0 }; let requests = 0;
  await assert.rejects(paySignal(endpoint, arc, await quote(), id, creator(counter), async () => {
    requests++; return new Response(JSON.stringify({ reason: "invalid_signature" }), { status: 402 });
  }), /402 \(invalid_signature\).*do not repay/);
  assert.equal(requests, 1); assert.equal(counter.signed, 1);
  try {
    await paySignal(endpoint, arc, await quote(), id, creator({ signed: 0 }), async () => new Response(JSON.stringify({ reason: `signature_0x${"1".repeat(130)}`, payload: "private-response-fixture" }), { status: 402 }));
    assert.fail("Expected a rejected payment");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /signature_0x|private-response-fixture/);
  }
});

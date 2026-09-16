import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { buildPaymentRequirements, withGateway } from "../lib/x402";
import { GET as signalRoute } from "../app/api/signals/latest/route";

process.env.RADAR_NETWORK = "testnet";
process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
delete process.env.PAYMENT_AUDIT_PATH;
const endpoint = "/api/signals/latest";
function request(payload?: unknown) {
  return new NextRequest(`http://localhost:3000${endpoint}`, { headers: payload === undefined ? {} : { "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } });
}
const validPayload = () => ({ x402Version: 2, accepted: buildPaymentRequirements("0.001"), payload: { signature: "test-only-mocked-not-a-signature" } });
function provider(options: { valid?: boolean; success?: boolean; throws?: boolean } = {}) {
  const calls: string[] = [];
  return { calls,
    async verify() { calls.push("verify"); return { isValid: options.valid ?? true, payer: "test-payer" }; },
    async settle() {
      calls.push("settle");
      if (options.throws) throw new Error("private-provider-details");
      return { success: options.success ?? true, network: "eip155:5042002", payer: "test-payer", transaction: "test-gateway-reference" };
    },
  };
}

test("unpaid challenge makes no provider calls and exposes no signal", async () => {
  const facilitator = provider();
  const route = withGateway(async () => { throw new Error("must not run"); }, "0.001", endpoint, { facilitator });
  const response = await route(request());
  assert.equal(response.status, 402);
  assert.deepEqual(await response.json(), {});
  assert.deepEqual(facilitator.calls, []);
  const challenge = JSON.parse(Buffer.from(response.headers.get("payment-required")!, "base64").toString());
  assert.equal(challenge.accepts[0].amount, "1000");
  assert.equal(challenge.accepts[0].network, "eip155:5042002");
});
test("malformed or substituted payments never contact Gateway", async () => {
  const facilitator = provider();
  const route = withGateway(async () => NextResponse.json({}), "0.001", endpoint, { facilitator });
  for (const payload of [{}, { ...validPayload(), accepted: { ...buildPaymentRequirements("0.001"), amount: "1" } }, { ...validPayload(), accepted: { ...buildPaymentRequirements("0.001"), network: "eip155:5042" } }]) {
    assert.equal((await route(request(payload))).status, 400);
  }
  assert.deepEqual(facilitator.calls, []);
});
test("unavailable content is not settled", async () => {
  const facilitator = provider();
  const route = withGateway(async () => NextResponse.json({ error: "stale" }, { status: 503 }), "0.001", endpoint, { facilitator });
  assert.equal((await route(request(validPayload()))).status, 503);
  assert.deepEqual(facilitator.calls, ["verify"]);
});
test("invalid authorization does not serve or settle content", async () => {
  const facilitator = provider({ valid: false });
  const route = withGateway(async () => { throw new Error("must not run"); }, "0.001", endpoint, { facilitator });
  assert.equal((await route(request(validPayload()))).status, 402);
  assert.deepEqual(facilitator.calls, ["verify"]);
});
test("settlement rejection does not expose prepared paid content", async () => {
  const facilitator = provider({ success: false });
  const route = withGateway(async () => NextResponse.json({ signal: "private-fixture" }), "0.001", endpoint, { facilitator });
  const response = await route(request(validPayload()));
  assert.equal(response.status, 402);
  assert.doesNotMatch(await response.text(), /private-fixture/);
});
test("delivery digest binds the exact response, not a claim of onchain confirmation", async () => {
  const facilitator = provider();
  const route = withGateway(async () => NextResponse.json({ signal: "explicit-test-fixture" }), "0.001", endpoint, { facilitator });
  const response = await route(request(validPayload()));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(response.headers.get("x-radar-response-sha256"), createHash("sha256").update(body).digest("hex"));
  assert.equal(response.headers.get("x-radar-payment-state"), "gateway_accepted_not_onchain_verified");
  assert.match(response.headers.get("x-radar-request-id")!, /^[a-f0-9-]{36}$/);
});
test("unknown settlement explicitly prohibits automatic repayment", async () => {
  const facilitator = provider({ throws: true });
  const route = withGateway(async () => NextResponse.json({}), "0.001", endpoint, { facilitator });
  const response = await route(request(validPayload()));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.payment_status, "unknown_do_not_repay");
  assert.equal(body.retry_safe, false);
  assert.doesNotMatch(JSON.stringify(body), /private-provider/);
});
test("unsupported request is rejected before demanding payment", async () => {
  const response = await signalRoute(new NextRequest("http://localhost:3000/api/signals/latest?symbol=DOGE-USD"));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("payment-required"), null);
});
test("mainnet configuration cannot accidentally enable the seller", async () => {
  process.env.RADAR_NETWORK = "mainnet";
  try {
    const facilitator = provider();
    const route = withGateway(async () => NextResponse.json({}), "0.001", endpoint, { facilitator });
    const response = await route(request());
    assert.equal(response.status, 503);
    assert.match(JSON.stringify(await response.json()), /MAINNET_EXECUTION_BLOCKED/);
    assert.deepEqual(facilitator.calls, []);
  } finally { process.env.RADAR_NETWORK = "testnet"; }
});

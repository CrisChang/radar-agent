import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { RedisPaymentStore } from "../../lib/redis-payment-store";
import { buildPaymentRequirements, withGateway } from "../../lib/x402";
import { paymentIdentity } from "../../lib/payment-store";
const exec = promisify(execFile);
const bin = process.env.REDIS_SERVER_BIN ?? "/opt/homebrew/bin/redis-server";
const cli = process.env.REDIS_CLI_BIN ?? "/opt/homebrew/bin/redis-cli";
process.env.ARC_NETWORK = "mainnet";
process.env.RADAR_ACCEPT_PAYMENTS = "true";
process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
delete process.env.PAYMENT_AUDIT_PATH;
delete process.env.PUBLIC_BASE_URL;
const requestId = "11111111-1111-4111-8111-111111111111";
const endpoint = "/api/signals/latest";
const payer = process.env.SELLER_ADDRESS!;
const payload = () => ({ x402Version: 2, accepted: buildPaymentRequirements("0.001"),
  payload: { signature: "explicit-mocked-fixture-never-broadcast", authorization: { from: payer, nonce: `0x${"1".repeat(64)}` } } });
function request() { return new NextRequest(`http://localhost:3000${endpoint}`, { headers: { "x-radar-request-id": requestId,
  "payment-signature": Buffer.from(JSON.stringify(payload())).toString("base64") } }); }
function facilitator(fail = false) {
  let settled = 0;
  return { get settled() { return settled; }, async verify() { return { isValid: true, payer }; }, async settle() {
    settled++; if (fail) throw new Error("synthetic timeout");
    return { success: true, payer, network: "eip155:5042", transaction: "explicit-test-reference-not-onchain" };
  } };
}

test("real Redis atomic claims, durable restarts and payment recovery", async t => {
  const root = await mkdtemp("/private/tmp/radar-redis-");
  const socket = `${root}/redis.sock`;
  let server: ChildProcess | undefined;
  async function start() {
    server = spawn(bin, ["--port", "0", "--unixsocket", socket, "--dir", root,
      "--appendonly", "yes", "--appendfsync", "always", "--loglevel", "warning"], { stdio: "ignore" });
    let startupError: Error | undefined;
    server.once("error", error => { startupError = error; });
    for (let i = 0; i < 100; i++) {
      if (startupError) throw startupError;
      try { await exec(cli, ["-s", socket, "PING"]); return; }
      catch { await new Promise(resolve => setTimeout(resolve, 20)); }
    }
    throw new Error("Local integration Redis did not start");
  }
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const ended = new Promise<void>(resolve => server!.once("close", () => resolve()));
    server.kill("SIGTERM"); await ended;
  }
  const bridge: typeof fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer explicit-test-token");
    const args = JSON.parse(String(init?.body)) as (string | number)[];
    const { stdout } = await exec(cli, ["-s", socket, "--json", ...args.map(String)], { maxBuffer: 4_194_304 });
    const result = JSON.parse(stdout);
    return Response.json({ result });
  };
  const makeStore = (namespace: string, fetcher = bridge) => new RedisPaymentStore({ url: "http://127.0.0.1/", token: "explicit-test-token", namespace, fetcher, allowLoopback: true });
  try {
    await start();
    await t.test("concurrent Vercel-style requests settle only once", async () => {
      const provider = facilitator(); const store = makeStore("test-concurrency");
      const route = withGateway(async () => NextResponse.json({ signal_id: "explicit-fixture" }), "0.001", endpoint, { store, facilitator: provider });
      const responses = await Promise.all(Array.from({ length: 16 }, () => route(request())));
      assert.equal(responses.every(r => [200,409].includes(r.status)), true);
      assert.equal(provider.settled, 1);
      const retry = await route(request());
      assert.equal(retry.status, 200); assert.equal(retry.headers.get("x-radar-replayed"), "true");
      assert.equal(provider.settled, 1);
      assert.equal((await store.listForPayer(payer, 50)).length, 1);
      assert.equal((await store.listForPayer("0x2222222222222222222222222222222222222222", 50)).length, 0);
    });
    await t.test("unknown settlement persists and refuses a second charge", async () => {
      const provider = facilitator(true); const store = makeStore("test-unknown");
      const route = withGateway(async () => NextResponse.json({ signal_id: "must-stay-private" }), "0.001", endpoint, { store, facilitator: provider });
      const first = await route(request()); assert.equal(first.status, 502);
      assert.doesNotMatch(await first.text(), /must-stay-private/);
      assert.equal((await route(request())).status, 409);
      assert.equal(provider.settled, 1);
    });
    await t.test("lost accepted-write acknowledgement still replays the committed receipt", async () => {
      let lost = false;
      const flaky: typeof fetch = async (url, init) => {
        const response = await bridge(url, init); const args = JSON.parse(String(init?.body));
        if (!lost && args[0] === "EVAL" && args[5] === "accepted") { lost = true; throw new Error("synthetic lost acknowledgement"); }
        return response;
      };
      const provider = facilitator(); const store = makeStore("test-ack", flaky);
      const route = withGateway(async () => NextResponse.json({ signal_id: "recoverable-fixture" }), "0.001", endpoint, { store, facilitator: provider });
      assert.equal((await route(request())).status, 502);
      const recovered = await route(request()); assert.equal(recovered.status, 200);
      assert.equal((await recovered.json()).signal_id, "recoverable-fixture");
      assert.equal(provider.settled, 1);
    });
    await t.test("receipts and response bytes survive a Redis process restart", async () => {
      const store = makeStore("test-restart");
      const identity = paymentIdentity(payload(), "eip155:5042", buildPaymentRequirements("0.001").extra.verifyingContract, requestId, "GET:/api/signals/latest?");
      await store.claim({ ...identity, requestId, state: "preparing", terms: { amountAtomic: "1000", asset: "fixture-usdc", payTo: payer } });
      const response = { status: 200, body: '{"signal_id":"persistent-fixture"}', headers: { "content-type": "application/json" } };
      await store.transition(identity.paymentKey, "preparing", "settling", response);
      await store.transition(identity.paymentKey, "settling", "accepted", response);
      await stop(); await start();
      const restored = await makeStore("test-restart").find(identity.paymentKey, identity.requestKey);
      assert.equal(restored?.state, "accepted"); assert.deepEqual(restored?.response, response);
      assert.equal(await store.claim({ ...identity, requestId, state: "preparing" }), false);
      await store.ping();
    });
  } finally { await stop(); await rm(root, { recursive: true, force: true }); }
});

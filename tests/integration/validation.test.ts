import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { ValidationStore } from "../../lib/validation-store";
import { RedisPaymentStore } from "../../lib/redis-payment-store";
import { PAYMENT_SCHEDULE, STAGES, CAMPAIGN_ID, intentRequestId } from "../../lib/validation-plan";
import { paymentIdentity, type PaymentRecord } from "../../lib/payment-store";
import { getArcConfig } from "../../lib/arc";

const exec = promisify(execFile), bin = "/opt/homebrew/bin/redis-server", cli = "/opt/homebrew/bin/redis-cli";
const payer = "0x2222222222222222222222222222222222222222", seller = "0x1111111111111111111111111111111111111111";
process.env.ARC_NETWORK = "mainnet"; process.env.PILOT_BUYER_ADDRESS = payer; process.env.SELLER_ADDRESS = seller;
const arc = getArcConfig();
test("real Redis campaign: atomic varied-amount budgets, 1,000 complete indexes, restarts, unknown halt and original pilot cap", async t => {
  const root = await mkdtemp("/private/tmp/radar-validation-redis-"), socket = `${root}/redis.sock`;
  let server: ChildProcess | undefined;
  async function start() {
    server = spawn(bin, ["--port", "0", "--unixsocket", socket, "--dir", root, "--appendonly", "yes", "--appendfsync", "always", "--loglevel", "warning"], { stdio: "ignore" });
    let startupError: Error | undefined; server.once("error", e => { startupError = e; });
    for (let n = 0; n < 100; n++) { if (startupError) throw startupError;
      try { await exec(cli, ["-s", socket, "PING"]); return; } catch { await new Promise(r => setTimeout(r, 20)); } }
    throw new Error("Redis integration server unavailable");
  }
  async function stop() { if (!server || server.exitCode !== null) return; const closed = new Promise<void>(r => server!.once("close", () => r())); server.kill("SIGTERM"); await closed; }
  const bridge: typeof fetch = async (_url, init) => {
    const args = JSON.parse(String(init?.body)) as (string | number)[];
    const { stdout } = await exec(cli, ["-s", socket, "--json", ...args.map(String)], { maxBuffer: 8_388_608 });
    return Response.json({ result: JSON.parse(stdout) });
  };
  const options = (namespace: string) => ({ url: "http://127.0.0.1/", token: "synthetic-local-token", namespace, fetcher: bridge, allowLoopback: true });
  function record(ordinal: number, nonceNumber = ordinal): PaymentRecord {
    const row = PAYMENT_SCHEDULE[ordinal - 1], requestId = intentRequestId(row);
    const identity = paymentIdentity({ payload: { authorization: { from: payer, nonce: `0x${nonceNumber.toString(16).padStart(64, "0")}` } } }, arc.network, arc.gatewayWallet, requestId, `GET:/api/validation/payment?intent=${row.planned_intent_id}`);
    return { ...identity, requestId, state: "preparing", campaign: { id: CAMPAIGN_ID, intent: row.planned_intent_id }, terms: { amountAtomic: row.amount_atomic, asset: arc.usdc, payTo: seller } };
  }
  const response = { status: 200, body: '{"synthetic_fixture":true}', headers: { "content-type": "application/json" } };
  try {
    await start();
    await t.test("no approval, changed amount, wrong payer and wrong stage fail closed", async () => {
      const store = new ValidationStore(options("validation-guards"));
      assert.equal(await store.claim(record(1)), false); assert.equal(await store.approve(2), false);
      assert.equal(await store.approve(1), true); assert.equal(await store.approve(1), false);
      const wrong = record(1); wrong.terms!.amountAtomic = "101"; await assert.rejects(store.claim(wrong));
      const wrongPayer = record(1); wrongPayer.authorization!.payer = seller; await assert.rejects(store.claim(wrongPayer));
      assert.equal(await store.claim(record(11)), false); assert.equal(await store.approve(2), false);
      assert.equal((await store.state())!.reservedCount, 0);
    });
    await t.test("concurrent replacement nonces cannot consume one intent more than once", async () => {
      const store = new ValidationStore(options("validation-concurrent")); await store.approve(1);
      const records = Array.from({ length: 12 }, (_, n) => record(1, n + 1001));
      const results = await Promise.all(records.map(r => store.claim(r)));
      assert.equal(results.filter(Boolean).length, 1); assert.equal((await store.state())!.reservedCount, 1);
      assert.equal((await store.state())!.reservedAtomic, PAYMENT_SCHEDULE[0].amount_atomic);
      assert.equal(await store.claim(record(2)), false); // no new intent while an outcome is in flight
      const accepted = records[results.indexOf(true)]; await store.transition(accepted.paymentKey, "preparing", "settling", response);
      await store.transition(accepted.paymentKey, "settling", "accepted", response);
      assert.equal(await store.claim(record(2)), true);
    });
    await t.test("unknown persists across restart and only matching completed evidence can recover prepared bytes", async () => {
      let store = new ValidationStore(options("validation-unknown")); await store.approve(1); const r = record(1);
      await store.claim(r); await store.transition(r.paymentKey, "preparing", "settling", response); await store.transition(r.paymentKey, "settling", "unknown");
      await stop(); await start(); store = new ValidationStore(options("validation-unknown"));
      assert.equal((await store.state())!.halted, true); assert.equal(await store.claim(record(2)), false);
      const stored = await store.intent(r.campaign!.intent); assert.equal(stored?.state, "unknown");
      // The real reconciler calls this ONLY after provider matching + decoded
      // canonical batch evidence. This fixture tests the durable update itself.
      await store.recoverPrepared(stored!, "11111111-1111-4111-8111-111111111111");
      assert.equal((await store.intent(r.campaign!.intent))!.response!.body, response.body);
      const s = (await store.state())!; assert.equal(await store.publish(s, { synthetic_reconciliation_fixture: true }, 1, false), true);
      assert.equal((await store.state())!.halted, false); assert.equal(await store.claim(record(2)), true);
    });
    await t.test("local handoff requires complete reconciliation and atomically locks out old browser claims", async () => {
      const store = new ValidationStore(options("validation-handoff"));
      for (const stage of STAGES.slice(0, 2)) {
        await store.approve(stage.stage);
        for (const row of PAYMENT_SCHEDULE.filter(r => r.stage === stage.stage)) {
          const r = record(row.ordinal); assert.equal(await store.claim(r), true);
          await store.transition(r.paymentKey, "preparing", "settling", response); await store.transition(r.paymentKey, "settling", "accepted", response);
        }
        await store.publish((await store.state())!, { completed_payments: stage.cumulativeCount, money_difference_atomic: "0" }, stage.cumulativeCount, false);
      }
      const id = "11111111-1111-4111-8111-111111111111", hash = "a".repeat(64);
      assert.equal(await store.handoff(id, hash, 100), false); // must be stage three
      await store.approve(3, Date.now() - 86_400_000);
      const r = record(101); assert.equal(await store.claim(r), true);
      assert.equal(await store.handoff(id, hash, 101), false); // in-flight
      await store.transition(r.paymentKey, "preparing", "settling", response); await store.transition(r.paymentKey, "settling", "accepted", response);
      assert.equal(await store.handoff(id, hash, 101), false); // old report
      await store.publish((await store.state())!, { completed_payments: 101, money_difference_atomic: "1" }, 101, false);
      assert.equal(await store.handoff(id, hash, 101), false);
      await store.publish((await store.state())!, { completed_payments: 101, money_difference_atomic: "0" }, 101, false);
      assert.equal(await store.handoff(id, hash, 100), false); // count changed during client preparation
      const before = (await store.state())!;
      assert.equal(await store.handoff(id, hash, 101), true); assert.equal(await store.handoff(id, hash, 101), true);
      assert.equal(await store.handoff(id, "b".repeat(64), 101), false);
      const after = (await store.state())!;
      for (const k of ["reservedCount", "reservedAtomic", "maximumCount", "maximumAtomic", "expiresAt", "stage3StartedAt"] as const) assert.equal(after[k], before[k]);
      assert.equal(await store.claim(record(102)), false); // even an already-issued browser quote cannot claim
      const local = record(102); local.campaign!.runnerId = "wrong"; assert.equal(await store.claim(local), false);
      local.campaign!.runnerId = id; assert.equal(await store.claim(local), true);
      assert.equal(await store.handoff(id, hash, 101), true); // a retry is idempotent even after local progress
    });
    await t.test("all 1,000 varying payments fit exact stage and campaign budgets; exports survive restart", async () => {
      let store = new ValidationStore(options("validation-full"));
      for (const stage of STAGES) {
        assert.equal(await store.approve(stage.stage, Date.now() - (stage.stage === 3 ? 86_400_000 : 0)), true);
        for (const row of PAYMENT_SCHEDULE.filter(r => r.stage === stage.stage)) {
          const r = record(row.ordinal); assert.equal(await store.claim(r), true, row.planned_intent_id);
          await store.transition(r.paymentKey, "preparing", "settling", response); await store.transition(r.paymentKey, "settling", "accepted", response);
        }
        const s = (await store.state())!; assert.equal(s.reservedCount, stage.cumulativeCount); assert.equal(s.reservedAtomic, stage.cumulativeAtomic);
        assert.equal(await store.publish(s, { synthetic_reconciliation_fixture: true }, stage.cumulativeCount, false), true);
      }
      await stop(); await start(); store = new ValidationStore(options("validation-full"));
      assert.equal((await store.allRecords()).length, 1000); assert.equal((await store.state())!.reservedAtomic, "232600");
      assert.equal(await store.claim(record(1, 999999)), false); assert.equal(await store.approve(4).catch(() => false), false);
      let count = 0; for (let offset = 0; ; offset += 1000) { const page = await store.events(offset, 1000); count += page.length; if (page.length < 1000) break; }
      assert.equal(count, 3006); // 3 stage grants + 3 stage observations + 3 state events per intent
      const pilot = new RedisPaymentStore({ ...options("validation-full"), pilotPayer: payer, pilotPayTo: seller });
      const replacement = record(1, 555555); replacement.requestKey = "e".repeat(64); replacement.requestId = "11111111-1111-4111-8111-111111111111"; replacement.terms!.amountAtomic = "1000"; delete replacement.campaign;
      assert.equal(await pilot.claim(replacement), false); // unchanged ordinary pilot remains capped
    });
  } finally { await stop(); await rm(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { NextRequest } from "next/server";
import { PAYMENT_SCHEDULE, dueTime } from "../lib/validation-plan";
import { accelerationMessage, effectiveDueTime, timingEvidence, validateTimingAmendment, type TimingAmendment } from "../lib/validation-timing";
import { RUNNER_ORIGIN, RUNNER_PAYER, RUNNER_SELLER, type HandoffBundle } from "../lib/validation-handoff";
import { localSigningPermit } from "../lib/validation-local-policy";
import { campaignTypedData, CAMPAIGN_AUTH_WINDOW_SECONDS } from "../lib/validation-authorization";
import { getArcConfig } from "../lib/arc";
import { validationControl } from "../lib/validation-route";
const start = Date.now(), runnerId = "11111111-1111-4111-8111-111111111111", bundleHash = "a".repeat(64);
const amendment: TimingAmendment = { mode: "accelerated-5s-v1", fromOrdinal: 332, activatedAt: start + 1000,
  intervalMs: 5000, originalStage3StartedAt: start, authorizationHash: "b".repeat(64) };
process.env.ARC_NETWORK = "mainnet";

test("acceleration preserves old slots, enforces future slots and actual spacing, and cannot alter terms", () => {
  const state = { stage3StartedAt: start, timingAmendment: amendment };
  assert.equal(effectiveDueTime(PAYMENT_SCHEDULE[330], state), dueTime(PAYMENT_SCHEDULE[330], start));
  assert.equal(effectiveDueTime(PAYMENT_SCHEDULE[331], state), start + 6000);
  assert.equal(effectiveDueTime(PAYMENT_SCHEDULE[332], state), start + 11000);
  assert.equal(effectiveDueTime(PAYMENT_SCHEDULE[331], { ...state, lastClaimAt: start + 20000 }), start + 25000);
  for (const a of [{ ...amendment, intervalMs: 0 }, { ...amendment, fromOrdinal: 1001 }, { ...amendment, originalStage3StartedAt: start + 1 },
    { ...amendment, activatedAt: start - 1 }, { ...amendment, authorizationHash: "missing" }]) assert.throws(() => validateTimingAmendment(a as TimingAmendment, start));
  const row = PAYMENT_SCHEDULE[331], now = start + 6000;
  const b = { payer: RUNNER_PAYER, seller: RUNNER_SELLER } as HandoffBundle;
  const typed = campaignTypedData({ from: RUNNER_PAYER, to: RUNNER_SELLER, value: row.amount_atomic,
    validAfter: "0", validBefore: String(Math.floor(now / 1000) + CAMPAIGN_AUTH_WINDOW_SECONDS), nonce: `0x${"01".repeat(32)}` }, getArcConfig());
  assert.throws(() => localSigningPermit(row.planned_intent_id, typed, b, start, now));
  assert.throws(() => localSigningPermit(row.planned_intent_id, typed, b, state, now - 1));
  assert.ok(localSigningPermit(row.planned_intent_id, typed, b, state, now));
  assert.throws(() => localSigningPermit(row.planned_intent_id, { ...typed, message: { ...typed.message, value: 999999n } }, b, state, now));
});
test("report identifies timing amendments without mislabeling them as 24-hour evidence", () => {
  const original = { stage3StartedAt: start };
  assert.equal(timingEvidence(original, [{ ordinal: 101, at: start }, { ordinal: 1000, at: start + 86400000 }]).eligible_for_completion, true);
  assert.equal(timingEvidence(original, [{ ordinal: 1000, at: start + 3600000 }]).schedule_respected, false);
  const s = { ...original, timingAmendment: { ...amendment, fromOrdinal: 101 } };
  const evidence = timingEvidence(s, [{ ordinal: 101, at: start + 6000 }, { ordinal: 102, at: start + 11000 }]);
  assert.equal(evidence.mode, "accelerated-5s-v1"); assert.equal(evidence.original_24h_plan_followed, false);
  assert.equal(evidence.eligible_for_completion, true); // count, scenario, batch checks remain separate requirements
  assert.equal(timingEvidence(s, [{ ordinal: 101, at: start + 20000 }, { ordinal: 102, at: start + 20001 }]).schedule_respected, false);
});
test("signed amendment is bound to count, runner, bundle, origin, budget and five-minute expiry", async () => {
  const account = privateKeyToAccount(`0x${"04".repeat(32)}`); // synthetic test-only account
  process.env.PILOT_BUYER_ADDRESS = account.address; process.env.SELLER_ADDRESS = RUNNER_SELLER;
  process.env.UPSTASH_REDIS_REST_URL = "https://synthetic-test.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-only";
  const timestamp = String(Math.floor(Date.now()/1000)), message = accelerationMessage(RUNNER_ORIGIN, runnerId, bundleHash, 331, timestamp);
  assert.match(message, /0.232600 USDC/); assert.match(message, /5 seconds/); assert.match(message, /original 24-hour plan/);
  const signature = await account.signMessage({ message }), originalFetch = globalThis.fetch;
  let mutations = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "synthetic-test.upstash.io");
    const args = JSON.parse(String(init?.body));
    if (args[0] === "EVAL") { mutations++; assert.equal(args[6], runnerId); assert.equal(args[7], bundleHash); assert.equal(args[8], 331); return Response.json({ result: 1 }); }
    assert.equal(args[0], "GET"); return Response.json({ result: "{}" });
  };
  async function invoke(patch: Record<string, unknown> = {}) {
    return validationControl(new NextRequest(`${RUNNER_ORIGIN}/api/validation/control`, { method: "POST", body: JSON.stringify({ action: "accelerate", runnerId, bundleHash, reservedCount: 331, timestamp, signature, ...patch }) }));
  }
  try {
    for (const patch of [{ reservedCount: 332 }, { runnerId: "22222222-2222-4222-8222-222222222222" }, { bundleHash: "c".repeat(64) },
      { timestamp: String(Number(timestamp)-301) }, { timestamp: String(Number(timestamp)+31) }, { action: "resume" }]) assert.equal((await invoke(patch)).status, 400);
    assert.equal(mutations, 0);
    assert.equal((await invoke()).status, 200); assert.equal(mutations, 1);
  } finally { globalThis.fetch = originalFetch; }
});

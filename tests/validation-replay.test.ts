import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { NextRequest } from "next/server";
import { getArcConfig } from "../lib/arc";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, intentRequestId } from "../lib/validation-plan";
import { campaignTypedData, encodePayment, CAMPAIGN_AUTH_WINDOW_SECONDS, type CampaignAuthorization } from "../lib/validation-authorization";
import { buildPaymentRequirements } from "../lib/x402";
import { paymentIdentity, type PaymentRecord } from "../lib/payment-store";
import { replayAcceptedCampaign } from "../lib/validation-replay";
import { supplementConcurrentReplay } from "../lib/validation-replay-client";
import { concurrentEvidence, scenarioEvidence } from "../lib/validation-reconcile";
import { validationPayment } from "../lib/validation-route";
import type { PrivateJournal } from "../lib/validation-runner";
import type { CampaignEvent } from "../lib/validation-store";

// Public, deterministic fixture key. All network I/O below is intercepted.
const account = privateKeyToAccount(`0x${"08".repeat(32)}`), payer = account.address.toLowerCase(), seller = "0x1111111111111111111111111111111111111111";
process.env.ARC_NETWORK = "mainnet"; process.env.PILOT_BUYER_ADDRESS = payer; process.env.SELLER_ADDRESS = seller;
process.env.UPSTASH_REDIS_REST_URL = "https://synthetic-test.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-test-only";
process.env.RADAR_ACCEPT_PAYMENTS = "true";
const arc = getArcConfig(), row = PAYMENT_SCHEDULE[10], origin = "https://radar.example";
async function fixture() {
  const authorization: CampaignAuthorization = { from: account.address, to: seller, value: row.amount_atomic,
    validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + CAMPAIGN_AUTH_WINDOW_SECONDS), nonce: `0x${"09".repeat(32)}` };
  const payload = { x402Version: 2, accepted: buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS),
    resource: { url: `${origin}/api/validation/payment?intent=${row.planned_intent_id}` },
    payload: { authorization, signature: await account.signTypedData(campaignTypedData(authorization, arc)) } };
  const identity = paymentIdentity(payload, arc.network, arc.gatewayWallet, intentRequestId(row), `GET:/api/validation/payment?intent=${row.planned_intent_id}`);
  const body = JSON.stringify({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id, amount_atomic: row.amount_atomic });
  const record: PaymentRecord = { ...identity, requestId: intentRequestId(row), state: "accepted", campaign: { id: CAMPAIGN_ID, intent: row.planned_intent_id },
    terms: { amountAtomic: row.amount_atomic, asset: arc.usdc, payTo: seller }, response: { body, status: 200, headers: {
      "x-radar-request-id": intentRequestId(row), "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"),
      "payment-response": encodePayment({ success: true, payer, network: arc.network, transaction: "11111111-1111-4111-8111-111111111111" }) } } };
  const journal: PrivateJournal = { campaign: CAMPAIGN_ID, intent: row.planned_intent_id, requestId: intentRequestId(row), amountAtomic: row.amount_atomic,
    origin, payer, seller, state: "accepted", nonce: authorization.nonce, paymentHeader: encodePayment(payload), bootId: randomUUID(),
    responseHash: record.response!.headers["x-radar-response-sha256"], attempts: [{ at: "2026-10-13T00:00:00Z", status: 409, outcome: "prior_failure_retained" }] };
  return { payload, identity, record, journal };
}
test("receipt-only server never falls back when missing, pending, rejected, conflicting or corrupt", async () => {
  const c = await fixture();
  for (const record of [null, ...["preparing", "settling", "unknown", "rejected"].map(state => ({ ...c.record, state } as PaymentRecord)),
    { ...c.record, fingerprint: "wrong" }, { ...c.record, requestKey: "wrong" }, { ...c.record, campaign: { id: "wrong", intent: row.planned_intent_id } },
    { ...c.record, response: { ...c.record.response!, body: "modified" } }]) {
    const response = await replayAcceptedCampaign(row, c.identity, { async intent() { return record; } });
    assert.equal(response.status, 409); assert.equal((await response.json()).payment_attempted, false);
  }
  const before = JSON.stringify(c.record);
  const pair = await Promise.all([1, 2].map(() => replayAcceptedCampaign(row, c.identity, { async intent() { return c.record; } })));
  assert.deepEqual(await Promise.all(pair.map(r => r.text())), [c.record.response!.body, c.record.response!.body]);
  assert.ok(pair.every(r => r.headers.get("x-radar-replay-only") === "true")); assert.equal(JSON.stringify(c.record), before);
});
test("route replay-only guard never reaches facilitator or money-writing Redis commands", async () => {
  const c = await fixture(), originalFetch = globalThis.fetch, events: CampaignEvent[] = [];
  let current: PaymentRecord | null = c.record, calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++; assert.equal(new URL(String(input)).hostname, "synthetic-test.upstash.io", "no facilitator or RPC");
    const args = JSON.parse(String(init?.body));
    assert.ok(["GET", "RPUSH"].includes(args[0]), "no claim, transition, stage grant or budget mutation");
    if (args[0] === "RPUSH") { events.push(JSON.parse(args[2])); return Response.json({ result: events.length }); }
    return Response.json({ result: !current ? null : args[1].includes("intent:") ? current.paymentKey : JSON.stringify(current) });
  };
  const request = (header: string | null = c.journal.paymentHeader!) => new NextRequest(c.payload.resource.url, { headers: {
    "x-radar-replay-only": "true", "x-radar-request-id": c.journal.requestId, ...(header ? { "payment-signature": header } : {}) } });
  try {
    assert.equal((await validationPayment(request(null))).status, 400); assert.equal(calls, 0);
    const pair = await Promise.all([validationPayment(request()), validationPayment(request())]);
    assert.ok(pair.every(r => r.status === 200 && r.headers.get("x-radar-replay-only") === "true"));
    assert.deepEqual(await Promise.all(pair.map(r => r.text())), [c.record.response!.body, c.record.response!.body]);
    assert.ok(events.filter(e => e.type === "attempt_started").every(e => e.attemptKind === "settled_receipt_replay"));
    current = null; assert.equal((await validationPayment(request())).status, 409);
    current = { ...c.record, state: "unknown" }; assert.equal((await validationPayment(request())).status, 409);
    current = { ...c.record, fingerprint: "wrong" }; assert.equal((await validationPayment(request())).status, 409);
    assert.equal((await validationPayment(request("invalid"))).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});
test("client sends two overlapping exact saved headers, preserves failure history, never signs or replaces journal", async () => {
  const c = await fixture(); let saved = structuredClone(c.journal), entered = 0;
  let release!: () => void; const bothEntered = new Promise<void>(r => { release = r; });
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(String(input), c.payload.resource.url); const headers = new Headers(init?.headers);
    assert.equal(headers.get("payment-signature"), c.journal.paymentHeader); assert.equal(headers.get("x-radar-replay-only"), "true");
    assert.equal(headers.get("x-radar-request-id"), c.journal.requestId);
    if (++entered === 2) release(); await bothEntered;
    const response = await replayAcceptedCampaign(row, c.identity, { async intent() { return c.record; } });
    response.headers.set("x-radar-attempt-id", randomUUID()); return response;
  };
  const result = await supplementConcurrentReplay(row, { origin, payer, seller, bootId: randomUUID(), fetcher,
    async load() { return structuredClone(saved); }, async save(j) { saved = structuredClone(j); } });
  assert.equal(entered, 2); assert.equal(result.overlapVerified, false);
  assert.equal(saved.paymentHeader, c.journal.paymentHeader); assert.equal(saved.state, "accepted");
  assert.equal(saved.attempts.length, 3); assert.deepEqual(saved.attempts[0], c.journal.attempts[0]);
});
test("client fails closed for missing/wrong journals and preserves accepted state on transport or digest failures", async () => {
  const c = await fixture(); let saved: PrivateJournal | null = null, calls = 0;
  const deps = { origin, payer, seller, bootId: randomUUID(), async load() { return saved && structuredClone(saved); }, async save(j: PrivateJournal) { saved = structuredClone(j); },
    fetcher: (async () => { calls++; throw new Error("synthetic timeout"); }) as typeof fetch };
  await assert.rejects(supplementConcurrentReplay(row, deps)); assert.equal(calls, 0);
  saved = { ...c.journal, origin: "https://wrong.example" }; await assert.rejects(supplementConcurrentReplay(row, deps)); assert.equal(calls, 0);
  saved = structuredClone(c.journal); await assert.rejects(supplementConcurrentReplay(row, deps));
  assert.equal(calls, 2); assert.equal(saved!.state, "accepted"); assert.equal(saved!.paymentHeader, c.journal.paymentHeader);
  deps.fetcher = async () => new Response("modified", { headers: { ...c.record.response!.headers, "x-radar-replayed": "true", "x-radar-replay-only": "true", "x-radar-attempt-id": randomUUID() } });
  await assert.rejects(supplementConcurrentReplay(row, deps)); assert.equal(saved!.responseHash, c.journal.responseHash);
});
test("later genuine overlap can supplement earlier serial pair; duplicate/unmatched/bad intervals cannot", async () => {
  const { record } = await fixture();
  const start = (id: string, second: number, supplement = false): CampaignEvent => ({ type: "attempt_started", attemptId: id, intent: row.planned_intent_id,
    fingerprint: record.fingerprint, at: new Date(second * 1000).toISOString(), ...(supplement ? { attemptKind: "settled_receipt_replay" as const } : {}) });
  const end = (id: string, second: number, status = 200): CampaignEvent => ({ type: "attempt_finished", attemptId: id, status, state: "replayed", at: new Date(second * 1000).toISOString() });
  const old = [start("a", 1), end("a", 2), start("b", 3), end("b", 4)];
  assert.equal(concurrentEvidence(record, old), null);
  const later = [start("c", 5, true), start("d", 6, true), end("c", 7), end("d", 8)];
  assert.equal(concurrentEvidence(record, [...old, ...later]), "settled_receipt_replay");
  assert.equal(scenarioEvidence(row.scenario, record, [...old, ...later]), true);
  for (const invalid of [later.slice(0, 3), [...later, end("c", 7)], [...later, start("c", 5)],
    [later[0], { ...later[1], at: "invalid" }, ...later.slice(2)],
    [later[0], later[1], end("c", 5), later[3]], [later[0], later[2], later[1], later[3]],
    [later[0], later[1], end("c", 7, 409), later[3]],
    [later[0], { ...later[1], fingerprint: "other" }, ...later.slice(2)]]) assert.equal(concurrentEvidence(record, [...old, ...invalid]), null);
  assert.equal(concurrentEvidence(record, [start("a", 1), start("b", 2), end("a", 3), end("b", 4, 409)]), "payment_endpoint_attempts");
});

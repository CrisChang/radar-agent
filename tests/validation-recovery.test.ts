import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { getArcConfig } from "../lib/arc";
import { buildPaymentRequirements } from "../lib/x402";
import { validateOffer } from "../lib/agent-contract";
import { paymentIdentity, type PaymentRecord } from "../lib/payment-store";
import { CAMPAIGN_ID, intentRequestId, PAYMENT_SCHEDULE } from "../lib/validation-plan";
import { CAMPAIGN_AUTH_WINDOW_SECONDS, campaignTypedData, decodePayment, encodePayment, type CampaignPayload } from "../lib/validation-authorization";
import { validationRecovery } from "../lib/validation-recovery";
import { renewRejectedAuthorization } from "../lib/validation-renewal";
import { runPlannedPayment, type PrivateJournal, type RunnerDependencies } from "../lib/validation-runner";
import type { CampaignState } from "../lib/validation-store";

const account = privateKeyToAccount(`0x${"03".repeat(32)}`), payer = account.address.toLowerCase(), seller = "0x1111111111111111111111111111111111111111", origin = "https://radar.example";
process.env.ARC_NETWORK = "mainnet"; process.env.PILOT_BUYER_ADDRESS = payer; process.env.SELLER_ADDRESS = seller; process.env.PUBLIC_BASE_URL = origin;
const arc = getArcConfig(), row = PAYMENT_SCHEDULE[2], nonce = `0x${"ad".repeat(32)}` as `0x${string}`;
async function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const authorization = { from: account.address, to: seller as `0x${string}`, value: row.amount_atomic, validAfter: String(now - 800), validBefore: String(now + 604_600), nonce };
  const original: CampaignPayload = { x402Version: 2, accepted: buildPaymentRequirements(row.amount_usdc),
    resource: { url: `${origin}/api/validation/payment?intent=${row.planned_intent_id}` },
    payload: { authorization, signature: await account.signTypedData(campaignTypedData(authorization, arc)) } };
  const header = encodePayment(original);
  let saved: PrivateJournal = { campaign: CAMPAIGN_ID, intent: row.planned_intent_id, requestId: intentRequestId(row), amountAtomic: row.amount_atomic,
    origin, payer, seller, state: "unknown", paymentHeader: header, nonce, bootId: "boot-one", attempts: [{ at: new Date().toISOString(), status: 402, outcome: "http_response" }] };
  const state: CampaignState = { stage: 1, reservedCount: 2, reservedAtomic: "109", maximumCount: 10, maximumAtomic: "2326", expiresAt: Date.now() + 3_600_000,
    startedAt: Date.now() - 200_000, stage3StartedAt: 0, halted: false, verifiedCount: 0, reportRevision: 0 };
  const events: unknown[] = []; let reserved: PaymentRecord | null = null, signatures = 0, settles = 0, verifyCalls = 0;
  const store = { async state() { return state; }, async intent() { return reserved; }, async find() { return reserved; }, async appendEvent(e: unknown) { events.push(e); } };
  const facilitator = { async verify() { verifyCalls++; return { isValid: false, invalidReason: "authorization_validity_too_short" }; }, async settle() { settles++; throw new Error("Forbidden in recovery"); } };
  const server = { store, facilitator, transfers: async () => [] };
  const request = () => new NextRequest(`${origin}/api/validation/recovery?intent=${row.planned_intent_id}`, { headers: { "payment-signature": header } });
  const paths: string[] = [];
  const deps: RunnerDependencies = { origin, payer, seller, bootId: "boot-two", signer: { address: account.address, async signTypedData(params) {
    signatures++; assert.equal(saved.state, "renewing"); assert.equal(saved.paymentHeader, header); assert.equal(saved.pendingRenewal?.nonce, nonce);
    return account.signTypedData(params);
  } }, async load() { return structuredClone(saved); }, async save(j) { saved = structuredClone(j); },
    async fetcher(input, init) { paths.push(new URL(String(input)).pathname); return validationRecovery(new NextRequest(String(input), { ...init, signal: init?.signal ?? undefined }), server); } };
  return { original, header, request, store, facilitator, server, deps, paths, events, state,
    get saved() { return saved; }, set saved(v: PrivateJournal) { saved = v; }, set reserved(v: PaymentRecord | null) { reserved = v; },
    get signatures() { return signatures; }, get settles() { return settles; }, get verifyCalls() { return verifyCalls; } };
}
test("a conclusively rejected unreserved authorization gets a read-only same-nonce renewal quote", async () => {
  const f = await fixture(), response = await validationRecovery(f.request(), f.server), proof = await response.json();
  assert.equal(response.status, 200); assert.equal(proof.settlement_attempted, false); assert.equal(f.settles, 0);
  assert.equal(proof.original_header_sha256, createHash("sha256").update(f.header).digest("hex"));
  assert.deepEqual({ ...proof.authorization, validBefore: f.original.payload.authorization.validBefore }, f.original.payload.authorization);
  assert.equal(proof.requirements.maxTimeoutSeconds, 608_400); assert.equal(f.events.length, 1);
  assert.ok(!JSON.stringify(f.events).includes(f.header)); assert.ok(!JSON.stringify(f.events).includes(nonce));
});
test("existing reservations, used nonces, other rejections and unavailable evidence cannot renew", async () => {
  for (const mode of ["reserved", "used_nonce", "valid", "other_reason", "verify_error", "history_error", "wrong_owner"] as const) {
    const f = await fixture(); let request = f.request();
    if (mode === "reserved") f.reserved = { state: "accepted" } as PaymentRecord;
    if (mode === "used_nonce") f.server.transfers = async () => [{ nonce, fromAddress: payer }] as never[];
    if (mode === "valid") f.facilitator.verify = async () => ({ isValid: true, invalidReason: "" });
    if (mode === "other_reason") f.facilitator.verify = async () => ({ isValid: false, invalidReason: "nonce_already_used" });
    if (mode === "verify_error") f.facilitator.verify = async () => { throw new Error("synthetic upstream failure"); };
    if (mode === "history_error") f.server.transfers = async () => { throw new Error("synthetic incomplete pagination"); };
    if (mode === "wrong_owner") { const p = structuredClone(f.original); p.payload.signature = `0x${"00".repeat(65)}`; request = new NextRequest(f.request().url, { headers: { "payment-signature": encodePayment(p) } }); }
    assert.equal((await validationRecovery(request, f.server)).status, 409, mode); assert.equal(f.events.length, 0, mode); assert.equal(f.settles, 0, mode);
  }
});
test("reservation races and an allegedly short but still long-lived authorization are blocked", async () => {
  const f = await fixture(); let calls = 0;
  f.store.intent = async () => ++calls > 1 ? { state: "accepted" } as PaymentRecord : null;
  assert.equal((await validationRecovery(f.request(), f.server)).status, 409); assert.equal(f.events.length, 0);
  const other = await fixture(), p = structuredClone(other.original);
  p.payload.authorization.validBefore = String(Math.floor(Date.now() / 1000) + 604_901);
  p.payload.signature = await account.signTypedData(campaignTypedData(p.payload.authorization, arc));
  assert.equal((await validationRecovery(new NextRequest(other.request().url, { headers: { "payment-signature": encodePayment(p) } }), other.server)).status, 409);
});
test("owner renewal retains the nonce and old signed history, commits before submit and does not itself pay", async () => {
  const f = await fixture(); await renewRejectedAuthorization(row, f.deps);
  assert.equal(f.signatures, 1); assert.equal(f.settles, 0); assert.deepEqual(f.paths, ["/api/validation/recovery"]);
  assert.equal(f.saved.state, "signed"); assert.equal(f.saved.nonce, nonce); assert.equal(f.saved.pendingRenewal, undefined);
  assert.equal(f.saved.renewals?.[0].originalPaymentHeader, f.header);
  const updated = decodePayment(f.saved.paymentHeader!) as CampaignPayload;
  const key = (p: CampaignPayload) => paymentIdentity(p as unknown as { payload: Record<string, unknown> }, arc.network, arc.gatewayWallet, intentRequestId(row), `GET:/api/validation/payment?intent=${row.planned_intent_id}`);
  assert.equal(key(updated).paymentKey, key(f.original).paymentKey); assert.notEqual(key(updated).fingerprint, key(f.original).fingerprint);
  let submitted = 0; const body = JSON.stringify({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id, amount_atomic: row.amount_atomic });
  f.deps.fetcher = async (_input, init) => { submitted++; assert.equal(new Headers(init?.headers).get("payment-signature"), f.saved.paymentHeader);
    return new Response(body, { headers: { "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"), "payment-response": encodePayment({ success: true, payer, network: arc.network, transaction: "11111111-1111-4111-8111-111111111111" }) } }); };
  assert.equal((await runPlannedPayment(row, f.deps)).state, "accepted"); assert.equal(f.signatures, 1); assert.equal(submitted, 1);
});
test("tampered recovery terms never reach a wallet signature", async () => {
  for (const field of ["nonce", "value", "to", "validAfter", "validBefore", "digest", "expiry", "resource"] as const) {
    const f = await fixture();
    f.deps.fetcher = async () => {
      const proof = await (await validationRecovery(f.request(), f.server)).json();
      if (field === "nonce") proof.authorization.nonce = `0x${"aa".repeat(32)}`;
      if (field === "value") proof.authorization.value = "1000";
      if (field === "to") proof.authorization.to = payer;
      if (field === "validAfter") proof.authorization.validAfter = "0";
      if (field === "validBefore") proof.authorization.validBefore = String(Number(proof.authorization.validBefore) + 1);
      if (field === "digest") proof.original_header_sha256 = "0".repeat(64);
      if (field === "expiry") proof.expires_at = 1;
      if (field === "resource") proof.resource.url = "https://other.example";
      return Response.json(proof);
    };
    await assert.rejects(renewRejectedAuthorization(row, f.deps), e => e instanceof Error, field); assert.equal(f.signatures, 0, field); assert.equal(f.saved.paymentHeader, f.header, field);
  }
});
test("unknown renewal signing or a failed final journal write blocks both old replay and another signature", async () => {
  for (const mode of ["unknown_signing", "final_save_failure"] as const) {
    const f = await fixture();
    if (mode === "unknown_signing") f.deps.signer.signTypedData = async () => { throw new Error("synthetic wallet interruption"); };
    if (mode === "final_save_failure") { const save = f.deps.save; f.deps.save = async j => { if (j.state === "signed") throw new Error("synthetic storage failure"); await save(j); }; }
    await assert.rejects(renewRejectedAuthorization(row, f.deps)); assert.equal(f.saved.state, "renewing"); assert.equal(f.saved.paymentHeader, f.header);
    const before = f.paths.length; await assert.rejects(runPlannedPayment(row, f.deps)); await assert.rejects(renewRejectedAuthorization(row, f.deps)); assert.equal(f.paths.length, before);
  }
});
test("explicit renewal cancellation restores the original authorization without a payment", async () => {
  const f = await fixture(); f.deps.signer.signTypedData = async () => { throw { cause: { code: 4001 } }; };
  await assert.rejects(renewRejectedAuthorization(row, f.deps), /取消/); assert.equal(f.saved.state, "unknown"); assert.equal(f.saved.paymentHeader, f.header);
  assert.equal(f.saved.pendingRenewal, undefined); assert.equal(f.saved.attempts.at(-1)?.outcome, "validity_renewal_rejected_before_signature");
});
test("campaign one-hour buffer survives a three-minute human signature delay without extending the ordinary pilot policy", async () => {
  const quote = buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS);
  assert.equal(buildPaymentRequirements(row.amount_usdc).maxTimeoutSeconds, 604_900);
  assert.throws(() => validateOffer({ x402Version: 2, accepts: [quote] }, arc, row.amount_atomic));
  const realNow = Date.now, start = realNow(); let clock = start;
  let saved: PrivateJournal | null = null, remaining = 0;
  Date.now = () => clock;
  try {
    const result = await runPlannedPayment(row, { origin, payer, seller, bootId: "boot", signer: { address: account.address,
      async signTypedData(params) { clock += 180_000; remaining = Number(params.message.validBefore) - Math.floor(Date.now() / 1000); return account.signTypedData(params); } },
      async load() { return saved; }, async save(j) { saved = structuredClone(j); },
      async fetcher(_input, init) {
        if (!new Headers(init?.headers).has("payment-signature")) return new Response("{}", { status: 402, headers: { "payment-required": encodePayment({ x402Version: 2, accepts: [quote], resource: { url: `${origin}/api/validation/payment?intent=${row.planned_intent_id}` } }) } });
        assert.ok(remaining >= 604_800); const body = JSON.stringify({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id, amount_atomic: row.amount_atomic });
        return new Response(body, { headers: { "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"), "payment-response": encodePayment({ success: true, payer, network: arc.network, transaction: "11111111-1111-4111-8111-111111111111" }) } });
      } });
    assert.equal(result.state, "accepted"); assert.equal(remaining, 608_220);
  } finally { Date.now = realNow; }
});
test("validity rejection keeps its reason and exact authorization; generic retry never signs again", async () => {
  const f = await fixture(); let calls = 0;
  f.deps.fetcher = async () => { calls++; return Response.json({ reason: "authorization_validity_too_short", payment_status: "not_settled" }, { status: 402 }); };
  await assert.rejects(runPlannedPayment(row, f.deps), /原授权剩余有效期不足/);
  assert.equal(f.saved.lastFailure?.reason, "authorization_validity_too_short"); assert.equal(f.saved.paymentHeader, f.header); assert.equal(f.signatures, 0); assert.equal(calls, 1);
});

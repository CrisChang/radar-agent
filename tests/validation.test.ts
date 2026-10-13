import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PAYMENT_SCHEDULE, STAGES, SCHEDULE_SHA256, dueTime, approvalMessage } from "../lib/validation-plan";
import { BATCH_ABI, decodeBatch, matchTransfer, batchWalletDifference, searchAllTransfers, type GatewayTransfer, scenarioEvidence } from "../lib/validation-reconcile";
import { getArcConfig } from "../lib/arc";
import type { PaymentRecord } from "../lib/payment-store";
import { runPlannedPayment, type PrivateJournal } from "../lib/validation-runner";
import { buildPaymentRequirements } from "../lib/x402";
process.env.ARC_NETWORK = "mainnet";
const account = privateKeyToAccount(`0x${"03".repeat(32)}`), payer = account.address.toLowerCase(), seller = "0x1111111111111111111111111111111111111111";
process.env.SELLER_ADDRESS = seller; process.env.PILOT_BUYER_ADDRESS = payer;
const arc = getArcConfig(), nonce = `0x${"ab".repeat(32)}`;
const transfer = (): GatewayTransfer => ({ id: "11111111-1111-4111-8111-111111111111", status: "completed", token: "USDC", sendingNetwork: arc.network,
  recipientNetwork: arc.network, fromAddress: payer, toAddress: seller, amount: "100", nonce, txHash: `0x${"cd".repeat(32)}` });
test("frozen schedule has 1,000 varied payments, exact budgets, every scenario at every tier, and a 24-hour final stage", () => {
  assert.equal(createHash("sha256").update(readFileSync(new URL("../docs/validation-schedule.jsonl", import.meta.url))).digest("hex"), SCHEDULE_SHA256);
  assert.deepEqual(PAYMENT_SCHEDULE, readFileSync(new URL("../docs/validation-schedule.jsonl", import.meta.url), "utf8").trim().split("\n").map(line => JSON.parse(line)));
  assert.equal(PAYMENT_SCHEDULE.length, 1000);
  assert.equal(PAYMENT_SCHEDULE.reduce((s, r) => s + BigInt(r.amount_atomic), 0n), 232600n);
  const tiers = new Map<string, number>(), combos = new Set<string>();
  for (const row of PAYMENT_SCHEDULE) { tiers.set(row.amount_atomic, (tiers.get(row.amount_atomic) ?? 0) + 1); combos.add(`${row.amount_atomic}:${row.scenario}`); assert.equal(row.state, "not_run"); }
  assert.equal(tiers.size, 10); assert.ok([...tiers.values()].every(n => n === 100)); assert.equal(combos.size, 60);
  for (const stage of STAGES) { const rows = PAYMENT_SCHEDULE.filter(r => r.stage === stage.stage); assert.equal(rows.length, stage.count); assert.equal(rows.reduce((s, r) => s + BigInt(r.amount_atomic), 0n).toString(), stage.amountAtomic); }
  assert.equal(dueTime(PAYMENT_SCHEDULE[999], 5000) - dueTime(PAYMENT_SCHEDULE[100], 5000), 86_400_000);
  assert.match(approvalMessage("https://radar.example", payer, seller, 1, "1791840000"), /0\.002326/);
  assert.throws(() => approvalMessage("https://radar.example", payer, seller, 4, "1791840000"));
});
test("batch calldata exposes net deltas, rejects wrong domain and non-zero total, and includes other wallet movements", () => {
  const params = [{ type: "tuple[]", components: [{ name: "depositor", type: "address" }, { name: "value", type: "int256" }] }, { type: "bytes32" }, { type: "uint32" }, { type: "address" }, { type: "address" }] as const;
  const encode = (credit: bigint, domain = 26) => encodeFunctionData({ abi: BATCH_ABI, functionName: "submitBatch", args: [encodeAbiParameters(params,
    [[{ depositor: account.address, value: -100n }, { depositor: seller, value: credit }], `0x${"ef".repeat(32)}`, domain, arc.usdc, arc.gatewayWallet]), "0x"] });
  const batch = decodeBatch(encode(100n)); assert.equal(batch.deltas.length, 2);
  assert.throws(() => decodeBatch(encode(101n))); assert.throws(() => decodeBatch(encode(100n, 1)));
  assert.equal(batchWalletDifference(batch.deltas, [transfer()], transfer().txHash!, payer).difference, "0");
  assert.equal(batchWalletDifference(batch.deltas, [{ ...transfer(), amount: "101" }], transfer().txHash!, payer).difference, "1");
});
test("reconciliation rejects duplicate charges, wrong amounts and wrong networks without rounding", () => {
  const record = { state: "settling", authorization: { payer, nonce, network: arc.network }, terms: { amountAtomic: "100", payTo: seller } } as PaymentRecord;
  assert.equal(matchTransfer(record, [transfer()])?.amount, "100");
  assert.equal(matchTransfer(record, []), null);
  assert.throws(() => matchTransfer(record, [transfer(), { ...transfer(), id: "another-id" }]));
  assert.throws(() => matchTransfer(record, [{ ...transfer(), amount: "101" }]));
  assert.throws(() => matchTransfer(record, [{ ...transfer(), recipientNetwork: "eip155:1" }]));
});
test("Gateway history follows Link cursors to completion and fails on repeated pages", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async input => { calls++; const url = new URL(String(input));
    return Response.json({ transfers: url.searchParams.has("pageAfter") ? [] : [transfer()] },
      { headers: url.searchParams.has("pageAfter") ? {} : { link: `<${url}&pageAfter=second>; rel="next"` } }); };
  assert.equal((await searchAllTransfers(fetcher)).length, 1); assert.equal(calls, 8);
  await assert.rejects(searchAllTransfers(async input => Response.json({ transfers: [transfer()] }, { headers: { link: `<${input}&pageAfter=repeat>; rel="next"` } })));
});
async function runnerCase(scenario: string, options: { fail?: boolean; changedQuote?: boolean } = {}) {
  const row = { ...PAYMENT_SCHEDULE[0], scenario }, origin = "https://radar.example";
  let saved: PrivateJournal | null = null, signatures = 0, paid = 0;
  const headers: string[] = [], body = JSON.stringify({ campaign_id: "arc-mainnet-reliability-1000-v1", intent: row.planned_intent_id, amount_atomic: row.amount_atomic });
  const requirements = buildPaymentRequirements(options.changedQuote ? "0.001" : row.amount_usdc);
  const fetcher: typeof fetch = async (_input, init) => {
    const header = new Headers(init?.headers).get("payment-signature");
    if (!header) return new Response("{}", { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify({ x402Version: 2, accepts: [requirements], resource: { url: `${origin}/api/validation/payment?intent=${row.planned_intent_id}` } })).toString("base64") } });
    paid++; headers.push(header); if (options.fail) throw new Error("synthetic response loss");
    return new Response(body, { headers: { "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"),
      "payment-response": Buffer.from(JSON.stringify({ success: true, payer, network: arc.network, transaction: transfer().id })).toString("base64") } });
  };
  const deps = { origin, payer, seller, bootId: "boot-one", fetcher, signer: { address: account.address, async signTypedData(params: Parameters<typeof account.signTypedData>[0]) { signatures++; return account.signTypedData(params); } },
    async load() { return saved ? structuredClone(saved) : null; }, async save(j: PrivateJournal) { saved = structuredClone(j); } };
  return { row, deps, get saved() { return saved; }, get signatures() { return signatures; }, get paid() { return paid; }, headers };
}
test("serial/concurrent replays and controlled discarded responses reuse the exact authorization and response digest", async () => {
  for (const scenario of ["serial_same_authorization_replay", "concurrent_same_authorization_replay", "response_loss_after_submit"]) {
    const c = await runnerCase(scenario); assert.equal((await runPlannedPayment(c.row, c.deps)).state, "accepted");
    assert.equal(c.signatures, 1); assert.equal(c.paid, 2); assert.equal(new Set(c.headers).size, 1);
    await runPlannedPayment(c.row, c.deps); assert.equal(c.paid, 2); assert.equal(c.signatures, 1);
  }
});
test("client restart genuinely requires a new boot and resumes the saved authorization", async () => {
  const c = await runnerCase("client_restart"); assert.equal((await runPlannedPayment(c.row, c.deps)).state, "restart_required");
  assert.equal((await runPlannedPayment(c.row, c.deps)).state, "restart_required"); assert.equal(c.paid, 1);
  assert.equal((await runPlannedPayment(c.row, { ...c.deps, bootId: "boot-two" })).state, "accepted");
  assert.equal(c.signatures, 1); assert.equal(c.paid, 2); assert.equal(new Set(c.headers).size, 1);
});
test("transport unknown keeps the original signature; changed quotes fail before signing", async () => {
  const c = await runnerCase("sequential", { fail: true }); await assert.rejects(runPlannedPayment(c.row, c.deps));
  assert.equal(c.saved?.state, "unknown"); assert.equal(c.signatures, 1);
  await assert.rejects(runPlannedPayment(c.row, c.deps)); assert.equal(c.signatures, 1); assert.equal(new Set(c.headers).size, 1);
  const changed = await runnerCase("sequential", { changedQuote: true }); await assert.rejects(runPlannedPayment(changed.row, changed.deps)); assert.equal(changed.signatures, 0);
});

test("a paid receipt alone cannot pass a retry, restart or discarded-response scenario", () => {
  const r = { fingerprint: "fingerprint", campaign: { intent: "planned-0001" } } as PaymentRecord;
  const start = { type: "attempt_started", at: "2026-10-13T00:00:00Z", intent: "planned-0001", attemptId: "one", fingerprint: "fingerprint", clientBootId: "boot-one" };
  const finish = { type: "attempt_finished", at: "2026-10-13T00:00:02Z", attemptId: "one", status: 200 };
  assert.equal(scenarioEvidence("sequential", r, [start, finish]), true);
  for (const scenario of ["serial_same_authorization_replay", "concurrent_same_authorization_replay", "response_loss_after_submit", "client_restart"]) assert.equal(scenarioEvidence(scenario, r, [start, finish]), false);
  const second = { ...start, at: "2026-10-13T00:00:01Z", attemptId: "two", clientBootId: "boot-two", clientAction: "restore_after_restart" };
  const replay = { ...finish, at: "2026-10-13T00:00:03Z", attemptId: "two", state: "replayed" };
  assert.equal(scenarioEvidence("client_restart", r, [start, finish, second, replay]), true);
  assert.equal(scenarioEvidence("concurrent_same_authorization_replay", r, [start, finish, second, replay]), true);
  assert.equal(scenarioEvidence("serial_same_authorization_replay", r, [start, finish, { ...second, fingerprint: "different" }, replay]), false);
});

test("explicit wallet cancellation can be retried without paying or replacing an existing authorization", async () => {
  const c = await runnerCase("sequential"), original = c.deps.signer.signTypedData;
  let rejected = false;
  c.deps.signer.signTypedData = async params => { if (!rejected) { rejected = true; throw { cause: { code: 4001 } }; } return original(params); };
  await assert.rejects(runPlannedPayment(c.row, c.deps));
  assert.equal(c.saved?.state, "signature_rejected"); assert.equal(c.paid, 0);
  assert.equal((await runPlannedPayment(c.row, c.deps)).state, "accepted"); assert.equal(c.paid, 1); assert.equal(c.signatures, 1);
});
test("accepted receipt attribution also verifies the stored exact response bytes", () => {
  const body = '{}';
  const record: PaymentRecord = { paymentKey: "a".repeat(64), requestKey: "b".repeat(64), fingerprint: "c".repeat(64), requestId: "11111111-1111-4111-8111-111111111111",
    state: "accepted", authorization: { payer, nonce, network: arc.network, gatewayWallet: arc.gatewayWallet }, terms: { amountAtomic: "100", payTo: seller, asset: arc.usdc },
    response: { status: 200, body, headers: { "x-radar-response-sha256": createHash("sha256").update(body).digest("hex"),
      "payment-response": Buffer.from(JSON.stringify({ success: true, network: arc.network, payer, transaction: transfer().id })).toString("base64") } } };
  assert.equal(matchTransfer(record, [transfer()])?.id, transfer().id);
  record.response!.body = '{"changed":true}'; assert.throws(() => matchTransfer(record, [transfer()]));
});

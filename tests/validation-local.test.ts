import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, chmod, symlink, stat, readFile, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { hashTypedData } from "viem";
import { NextRequest } from "next/server";
import { getArcConfig } from "../lib/arc";
import { CAMPAIGN_ID, SCHEDULE_SHA256, PAYMENT_SCHEDULE, intentRequestId } from "../lib/validation-plan";
import { campaignTypedData, encodePayment, CAMPAIGN_AUTH_WINDOW_SECONDS, type CampaignAuthorization } from "../lib/validation-authorization";
import { validateHandoffBundle, requireReservedJournals, handoffDigest, handoffMessage, stageThreeRows, RUNNER_ORIGIN, RUNNER_PAYER, RUNNER_SELLER, type HandoffBundle } from "../lib/validation-handoff";
import { localSigningPermit, addSigningPermit, validateSigningPermits, type SigningPermit } from "../lib/validation-local-policy";
import { privateDirectory, writePrivateJson, readPrivateJson } from "../lib/validation-local-files";
import { buildPaymentRequirements } from "../lib/x402";
import { runPlannedPayment, type PrivateJournal, type RunnerDependencies } from "../lib/validation-runner";
import { validationPayment } from "../lib/validation-route";
process.env.ARC_NETWORK = "mainnet"; process.env.PILOT_BUYER_ADDRESS = RUNNER_PAYER; process.env.SELLER_ADDRESS = RUNNER_SELLER;
process.env.UPSTASH_REDIS_REST_URL = "https://synthetic-test.upstash.io"; process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-test-only";
const arc = getArcConfig(), now = Date.now(), startedAt = now - 86_400_000;
function bundle(): HandoffBundle { return { schema: "radar-local-handoff-v1", campaign: CAMPAIGN_ID, scheduleSha256: SCHEDULE_SHA256,
  origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, runnerId: randomUUID(), createdAt: new Date(now).toISOString(), stage: 3, reservedCount: 100, journals: [] }; }
function authorization(ordinal = 101): CampaignAuthorization { return { from: RUNNER_PAYER, to: RUNNER_SELLER, value: PAYMENT_SCHEDULE[ordinal - 1].amount_atomic,
  nonce: `0x${ordinal.toString(16).padStart(64, "0")}`, validAfter: "0", validBefore: String(Math.floor(now / 1000) + CAMPAIGN_AUTH_WINDOW_SECONDS) }; }
function journal(ordinal = 101): PrivateJournal {
  const row = PAYMENT_SCHEDULE[ordinal - 1], a = authorization(ordinal);
  return { campaign: CAMPAIGN_ID, origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, amountAtomic: row.amount_atomic,
    intent: row.planned_intent_id, requestId: intentRequestId(row), nonce: a.nonce, bootId: "synthetic-boot", state: "accepted", responseHash: "a".repeat(64), attempts: [],
    paymentHeader: encodePayment({ x402Version: 2, accepted: buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS),
      resource: { url: `${RUNNER_ORIGIN}/api/validation/payment?intent=${row.planned_intent_id}` },
      payload: { authorization: a, signature: `0x${"ab".repeat(65)}` } }) }; // parsing fixture only, never submitted
}
test("handoff binds public scope and all original stage-three records without replacing unknown signatures", async () => {
  const b = { ...bundle(), reservedCount: 101, journals: [journal()] };
  const rows = [{ intent: "planned-0101", stage: 3, local_state: "accepted", response_sha256: "a".repeat(64) }];
  requireReservedJournals(b, rows);
  assert.equal(await handoffDigest(b), createHash("sha256").update(JSON.stringify(b)).digest("hex"));
  assert.match(handoffMessage(RUNNER_ORIGIN, b.runnerId, await handoffDigest(b), 101, String(Math.floor(now / 1000))), /No increase/);
  for (const patch of [{ origin: "https://evil.example" }, { payer: RUNNER_SELLER }, { seller: RUNNER_PAYER }, { scheduleSha256: "bad" },
    { stage: 2 }, { reservedCount: 99 }, { journals: [journal(), journal()] }]) assert.throws(() => validateHandoffBundle({ ...b, ...patch } as HandoffBundle));
  for (const patch of [{ state: "signing" }, { state: "renewing" }, { paymentHeader: undefined }, { nonce: "0x00" }, { state: "signature_rejected" }])
    assert.throws(() => validateHandoffBundle({ ...b, journals: [{ ...journal(), ...patch } as PrivateJournal] }));
  assert.throws(() => requireReservedJournals({ ...b, journals: [] }, rows));
  assert.throws(() => requireReservedJournals(b, [{ ...rows[0], response_sha256: "changed" }]));
  assert.throws(() => requireReservedJournals(b, []));
  // A preserved submitted header can be retried against an independently accepted receipt.
  requireReservedJournals({ ...b, journals: [{ ...journal(), state: "unknown" }] }, rows);
});
test("local signing guard enforces frozen amount, recipient, chain, time, nonce and cumulative budget", () => {
  const b = bundle(), a = authorization(), typed = campaignTypedData(a, arc), intent = "planned-0101";
  const permit = localSigningPermit(intent, typed, b, startedAt, now);
  assert.equal(permit.digest, hashTypedData(typed));
  assert.throws(() => localSigningPermit("planned-0102", campaignTypedData(authorization(102), arc), b, now, now));
  for (const changed of [ { ...typed, domain: { ...typed.domain, chainId: 1 } },
    { ...typed, message: { ...typed.message, to: RUNNER_PAYER } }, { ...typed, message: { ...typed.message, value: 999999n } },
    { ...typed, message: { ...typed.message, validBefore: BigInt(Math.floor(now / 1000) + 604799) } },
    { ...typed, message: { ...typed.message, validBefore: BigInt(Math.floor(now / 1000) + 700000) } },
    { ...typed, types: { TransferWithAuthorization: [] } } ]) assert.throws(() => localSigningPermit(intent, changed as typeof typed, b, startedAt, now));
  let permits = addSigningPermit([], permit); assert.equal(addSigningPermit(permits, permit), permits);
  const changed = { ...a, nonce: `0x${"ff".repeat(32)}` as `0x${string}` };
  assert.throws(() => addSigningPermit(permits, localSigningPermit(intent, campaignTypedData(changed, arc), b, startedAt, now)));
  assert.throws(() => validateSigningPermits([{ ...permit, digest: "changed" }]));
  assert.throws(() => validateSigningPermits([permit, permit]));
  // All 900 amounts remain exact atomic integers; the first two stages cannot enter this guard.
  permits = stageThreeRows().map(row => localSigningPermit(row.planned_intent_id, campaignTypedData(authorization(row.ordinal), arc), b, startedAt, now));
  assert.equal(validateSigningPermits(permits).reduce((n, p) => n + BigInt(p.authorization.value), 0n), 209340n);
  const first = authorization(1);
  assert.throws(() => addSigningPermit([], { intent: "planned-0001", digest: hashTypedData(campaignTypedData(first, arc)), authorization: first }));
});
test("private journals persist with restrictive permissions and fail closed on symlinks or unfinished writes", async () => {
  const root = await mkdtemp("/private/tmp/radar-local-fixture-"), path = `${root}/journal.json`;
  try {
    await privateDirectory(root); const value = { state: "signed", synthetic: true }; await writePrivateJson(path, value);
    assert.equal((await stat(path)).mode & 0o777, 0o600); assert.deepEqual(await readPrivateJson(path), value);
    await writeFile(`${path}.pending`, "uncommitted synthetic bytes", { mode: 0o600 });
    await assert.rejects(writePrivateJson(path, { changed: true })); assert.deepEqual(await readPrivateJson(path), value);
    await symlink(path, `${root}/link`); await assert.rejects(readPrivateJson(`${root}/link`));
    await chmod(path, 0o644); await assert.rejects(readPrivateJson(path));
    await chmod(root, 0o755); await assert.rejects(privateDirectory(root));
    assert.ok((await readFile(path, "utf8")).includes("synthetic"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("runner includes the execution identity on quote and saved-header requests, never asks for a second signature", async () => {
  const row = PAYMENT_SCHEDULE[100], b = bundle(); let saved: PrivateJournal | null = null, signatures = 0, requests = 0;
  const responseBody = JSON.stringify({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id, amount_atomic: row.amount_atomic });
  const fetcher: typeof fetch = async (_url, init) => {
    requests++; const headers = new Headers(init?.headers); assert.equal(headers.get("x-radar-runner-id"), b.runnerId);
    if (!headers.get("payment-signature")) return new Response("{}", { status: 402, headers: { "payment-required": encodePayment({ x402Version: 2,
      accepts: [buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS)], resource: { url: `${RUNNER_ORIGIN}/api/validation/payment?intent=${row.planned_intent_id}` } }) } });
    return new Response(responseBody, { headers: { "x-radar-response-sha256": createHash("sha256").update(responseBody).digest("hex"),
      "payment-response": encodePayment({ success: true, network: arc.network, payer: RUNNER_PAYER, transaction: "synthetic-transfer-id" }) } });
  };
  const deps = { origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, bootId: randomUUID(), runnerId: b.runnerId, fetcher,
    signer: { address: RUNNER_PAYER as `0x${string}`, async signTypedData(params: Parameters<RunnerDependencies["signer"]["signTypedData"]>[0]) {
      localSigningPermit(row.planned_intent_id, params as ReturnType<typeof campaignTypedData>, b, startedAt); signatures++; return `0x${"ab".repeat(65)}` as `0x${string}`;
    } }, async load() { return saved; }, async save(j: PrivateJournal) { saved = structuredClone(j); } };
  await runPlannedPayment(row, deps); const count = requests; await runPlannedPayment(row, { ...deps, bootId: randomUUID() });
  assert.equal(signatures, 1); assert.equal(requests, count);
});
test("a browser or mismatched runner cannot obtain a new quote after handoff", async () => {
  const original = globalThis.fetch, b = bundle(); let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(new URL(String(url)).hostname, "synthetic-test.upstash.io");
    const args = JSON.parse(String(init?.body)); assert.equal(args[0], "GET"); assert.ok(args[1].endsWith(":state"));
    return Response.json({ result: JSON.stringify({ executionMode: "local", runnerId: b.runnerId }) });
  };
  try {
    for (const id of ["", randomUUID()]) {
      const result = await validationPayment(new NextRequest(`${RUNNER_ORIGIN}/api/validation/payment?intent=planned-0101`, { headers: { "x-radar-runner-id": id } }));
      assert.equal(result.status, 409); assert.equal((await result.json()).payment_attempted, false);
    }
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("downloaded worker restarts as a new process and replays the saved header with no second signature", async () => {
  const root = await mkdtemp("/private/tmp/radar-worker-fixture-"), b = bundle(), row = stageThreeRows().find(r => r.scenario === "client_restart")!;
  const config = { bundle: b, state: { stage: 3, halted: false, expiresAt: Date.now() + 86_400_000, stage3StartedAt: startedAt,
    maximumCount: 1000, maximumAtomic: "232600", reservedCount: 100, executionMode: "local", runnerId: b.runnerId,
    bundleHash: await handoffDigest(b), handoffCount: 100 }, row,
    offer: buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS), root };
  const preload = `${root}/network-stub.mjs`;
  let signatures = 0;
  try {
    // Synthetic accepted records, no real keys or reusable payment signatures.
    await Promise.all(stageThreeRows().filter(r => r !== row).map(r => writeFile(`${root}/${r.planned_intent_id}.json`, JSON.stringify(journal(r.ordinal)), { mode: 0o600 })));
    await writeFile(`${root}/fixture.json`, JSON.stringify(config));
    await writeFile(preload, `import {readFile,appendFile} from "node:fs/promises"; import {createHash} from "node:crypto";
const c = JSON.parse(await readFile(new URL("./fixture.json",import.meta.url),"utf8"));
globalThis.fetch = async (input,init) => {
 const url=String(input); if(url===c.bundle.origin+"/api/validation/status") return Response.json({state:c.state});
 if(url!==c.bundle.origin+"/api/validation/payment?intent="+c.row.planned_intent_id) throw Error("unexpected request blocked");
 const h=new Headers(init?.headers); if(h.get("x-radar-runner-id")!==c.bundle.runnerId) throw Error("runner binding missing");
 const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64");
 if(!h.get("payment-signature")) return new Response("{}",{status:402,headers:{"payment-required":encode({x402Version:2,accepts:[c.offer],resource:{url}})}});
 await appendFile(c.root+"/sent.jsonl",JSON.stringify({header:h.get("payment-signature"),boot:h.get("x-radar-test-boot"),action:h.get("x-radar-test-client-action")})+"\\n");
 const body=JSON.stringify({campaign_id:c.bundle.campaign,intent:c.row.planned_intent_id,amount_atomic:c.row.amount_atomic});
 return new Response(body,{headers:{"x-radar-response-sha256":createHash("sha256").update(body).digest("hex"),"payment-response":encode({success:true,network:"eip155:5042",payer:c.bundle.payer,transaction:"synthetic-transfer"})}});
};`);
    async function launch() {
      const child = fork(fileURLToPath(new URL("../public/downloads/radar-validation-runner.cjs", import.meta.url)), ["--worker"],
        { execArgv: ["--import", preload], stdio: ["ignore", "ignore", "pipe", "ipc"], serialization: "advanced", env: { ...process.env, NODE_OPTIONS: "" } });
      child.on("message", (m: { type: string; id: string; intent: string; params: ReturnType<typeof campaignTypedData> }) => {
        if (m.type !== "sign") return;
        localSigningPermit(m.intent, m.params, b, startedAt); signatures++;
        child.send({ type: "signature", id: m.id, signature: `0x${"ab".repeat(65)}` });
      });
      const done = new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error("synthetic worker timeout")); }, 15_000);
        child.once("error", e => { clearTimeout(timer); reject(e); }); child.once("close", code => { clearTimeout(timer); resolve(code); });
      });
      child.send({ type: "init", bundle: b, root }); return done;
    }
    assert.equal(await launch(), 75);
    const first = (await readPrivateJson<PrivateJournal>(`${root}/${row.planned_intent_id}.json`))!;
    assert.equal(first.state, "restart_required"); assert.equal(signatures, 1);
    assert.equal(await launch(), 0); assert.equal(signatures, 1);
    const last = (await readPrivateJson<PrivateJournal>(`${root}/${row.planned_intent_id}.json`))!;
    assert.equal(last.state, "accepted"); assert.equal(last.paymentHeader, first.paymentHeader);
    const sent = (await readFile(`${root}/sent.jsonl`, "utf8")).trim().split("\n").map(x => JSON.parse(x));
    assert.equal(sent.length, 2); assert.equal(sent[0].header, sent[1].header); assert.notEqual(sent[0].boot, sent[1].boot);
    assert.equal(sent[1].action, "restore_after_restart");
  } finally { await rm(root, { recursive: true, force: true }); }
});

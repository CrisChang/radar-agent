import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, chmod } from "node:fs/promises";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { hashTypedData } from "viem";
import { getArcConfig } from "../lib/arc";
import { CAMPAIGN_ID, SCHEDULE_SHA256, PAYMENT_SCHEDULE, intentRequestId } from "../lib/validation-plan";
import { handoffDigest, RUNNER_ORIGIN, RUNNER_PAYER, RUNNER_SELLER, type HandoffBundle } from "../lib/validation-handoff";
import { campaignTypedData, encodePayment, CAMPAIGN_AUTH_WINDOW_SECONDS } from "../lib/validation-authorization";
import { buildPaymentRequirements } from "../lib/x402";
import { recoverUnsignedJournal, type RecoveryStatus } from "../lib/validation-local-recovery";
import { privateDirectory, writePrivateJson, readPrivateJson } from "../lib/validation-local-files";
import { runPlannedPayment, type PrivateJournal } from "../lib/validation-runner";
process.env.ARC_NETWORK = "mainnet"; process.env.PILOT_BUYER_ADDRESS = RUNNER_PAYER; process.env.SELLER_ADDRESS = RUNNER_SELLER;
const arc = getArcConfig(), row = PAYMENT_SCHEDULE[101], prior = PAYMENT_SCHEDULE[100];
async function fixture() {
 const root = await mkdtemp("/private/tmp/radar-unsigned-recovery-"), now = Date.now();
 const bundle: HandoffBundle = { schema: "radar-local-handoff-v1", campaign: CAMPAIGN_ID, scheduleSha256: SCHEDULE_SHA256,
   origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, stage: 3, runnerId: "11111111-1111-4111-8111-111111111111", reservedCount: 100, createdAt: new Date(now).toISOString(), journals: [] };
 const auth = { from: RUNNER_PAYER as `0x${string}`, to: RUNNER_SELLER as `0x${string}`, value: prior.amount_atomic, validAfter: "0",
   validBefore: String(Math.floor(now/1000)+CAMPAIGN_AUTH_WINDOW_SECONDS), nonce: `0x${"01".repeat(32)}` as `0x${string}` };
 const header = encodePayment({ x402Version: 2, accepted: buildPaymentRequirements(prior.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS),
   resource: { url: `${RUNNER_ORIGIN}/api/validation/payment?intent=${prior.planned_intent_id}` }, payload: { authorization: auth, signature: `0x${"ab".repeat(65)}` } });
 const original: PrivateJournal = { campaign: CAMPAIGN_ID, intent: row.planned_intent_id, requestId: intentRequestId(row), amountAtomic: row.amount_atomic,
   origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, state: "signing", bootId: "synthetic-boot", attempts: [] };
 const accepted: PrivateJournal = { ...original, intent: prior.planned_intent_id, requestId: intentRequestId(prior), amountAtomic: prior.amount_atomic,
   state: "accepted", paymentHeader: header, nonce: auth.nonce, responseHash: "a".repeat(64) };
 const permits = [{ intent: prior.planned_intent_id, digest: hashTypedData(campaignTypedData(auth, arc)), authorization: auth }];
 await writePrivateJson(`${root}/${prior.planned_intent_id}.json`, accepted); await writePrivateJson(`${root}/${row.planned_intent_id}.json`, original);
 await writePrivateJson(`${root}/.signing-permits.json`, permits);
 const status: RecoveryStatus = { state: { stage: 3, maximumCount: 1000, maximumAtomic: "232600", reservedCount: 101, reservedAtomic: "23360",
   expiresAt: now + 86400000, startedAt: now - 86400000, stage3StartedAt: now - 86400000, halted: false, verifiedCount: 101, reportRevision: 3,
   executionMode: "local", runnerId: bundle.runnerId, bundleHash: await handoffDigest(bundle), handoffCount: 100 },
   report: { attempted_payments: 101, completed_payments: 101, money_difference_atomic: "0", generated_at: new Date(now).toISOString(),
     rows: PAYMENT_SCHEDULE.map(p => ({ intent: p.planned_intent_id, stage: p.stage, local_state: p.ordinal <= 101 ? "accepted" : "not_run",
       http_attempts: p.ordinal <= 101 ? 1 : 0, response_sha256: p.ordinal <= 101 ? "a".repeat(64) : null, transfer_status: p.ordinal <= 101 ? "completed" : null, money_difference_atomic: p.ordinal <= 101 ? "0" : null })) } };
 return { root, bundle, original, accepted, permits, auth, status };
}
test("recover only a proven unissued signature, retain exact backup and prior bytes; next normal run can sign once", async () => {
 const f = await fixture(); let calls = 0;
 try {
  const permitBytes = await readFile(`${f.root}/.signing-permits.json`, "utf8"), priorBytes = await readFile(`${f.root}/${prior.planned_intent_id}.json`, "utf8");
  const result = await recoverUnsignedJournal(f.bundle, f.root, row.planned_intent_id, { status: async () => { calls++; return structuredClone(f.status); } });
  assert.equal(calls, 2); assert.equal(result.payment_attempted, false); assert.equal(result.private_key_read, false);
  const saved = (await readPrivateJson<PrivateJournal>(`${f.root}/${row.planned_intent_id}.json`))!;
  assert.equal(saved.state, "unsigned_interrupted"); assert.equal(saved.paymentHeader, undefined); assert.equal(saved.nonce, undefined);
  assert.equal(saved.attempts[0].outcome, "local_signer_not_issued_after_interruption");
  const backup = await readPrivateJson<{ original: PrivateJournal }>(`${f.root}/.unsigned-recovery-${row.planned_intent_id}.json`);
  assert.deepEqual(backup?.original, f.original);
  assert.equal(await readFile(`${f.root}/.signing-permits.json`, "utf8"), permitBytes);
  assert.equal(await readFile(`${f.root}/${prior.planned_intent_id}.json`, "utf8"), priorBytes);
  let signatures = 0, current = saved;
  // The separate normal execution path, after recovery, still validates the frozen quote before asking for one signature.
  await assert.rejects(runPlannedPayment(row, { origin: RUNNER_ORIGIN, payer: RUNNER_PAYER, seller: RUNNER_SELLER, bootId: "new-boot",
    signer: { address: RUNNER_PAYER, async signTypedData() { signatures++; throw Object.assign(new Error("synthetic cancellation"), { code: 4001 }); } },
    async load() { return current; }, async save(j) { current = structuredClone(j); },
    fetcher: async () => new Response("{}", { status: 402, headers: { "payment-required": encodePayment({ x402Version: 2,
      accepts: [buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS)], resource: { url: `${RUNNER_ORIGIN}/api/validation/payment?intent=${row.planned_intent_id}` } }) } }) }), /Wallet rejected/);
  assert.equal(signatures, 1);
 } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("ambiguous signatures, missing guard history, pending writes, mismatched receipts or changing server state cannot reset a journal", async () => {
 for (const issue of ["permit", "missing_guard", "missing_prior", "wrong_digest", "signed", "submitted", "prior_attempt", "pending", "partial_report", "seen_online", "count_changed", "server_changed", "future_local", "backup_conflict"]) {
  const f = await fixture(); let calls = 0;
  try {
   if (issue === "permit") { const auth = { ...f.auth, value: row.amount_atomic, nonce: `0x${"02".repeat(32)}` as `0x${string}` }; await writePrivateJson(`${f.root}/.signing-permits.json`, [...f.permits, { intent: row.planned_intent_id, authorization: auth, digest: hashTypedData(campaignTypedData(auth, arc)) }]); }
   if (issue === "missing_guard") await rm(`${f.root}/.signing-permits.json`);
   if (issue === "missing_prior") await writePrivateJson(`${f.root}/.signing-permits.json`, []);
   if (issue === "wrong_digest") await writePrivateJson(`${f.root}/${prior.planned_intent_id}.json`, { ...f.accepted, responseHash: "b".repeat(64) });
   if (issue === "signed") await writePrivateJson(`${f.root}/${row.planned_intent_id}.json`, { ...f.original, paymentHeader: "sensitive-must-not-appear" });
   if (issue === "submitted") await writePrivateJson(`${f.root}/${row.planned_intent_id}.json`, { ...f.original, state: "submitted" });
   if (issue === "prior_attempt") await writePrivateJson(`${f.root}/${row.planned_intent_id}.json`, { ...f.original, attempts: [{ outcome: "transport_or_response_unknown", at: "synthetic" }] });
   if (issue === "pending") await writeFile(`${f.root}/.signing-permits.json.pending`, "synthetic", { mode: 0o600 });
   if (issue === "partial_report") f.status.report!.money_difference_atomic = null;
   if (issue === "seen_online") f.status.report!.rows![101].http_attempts = 1;
   if (issue === "count_changed") f.status.state!.reservedCount = 102;
   if (issue === "future_local") await writePrivateJson(`${f.root}/planned-0103.json`, { ...f.original, intent: "planned-0103" });
   if (issue === "backup_conflict") await writePrivateJson(`${f.root}/.unsigned-recovery-${row.planned_intent_id}.json`, { schema: "conflicting" });
   const before = await readFile(`${f.root}/${row.planned_intent_id}.json`, "utf8");
   await assert.rejects(recoverUnsignedJournal(f.bundle, f.root, row.planned_intent_id, { status: async () => {
    calls++; const status = structuredClone(f.status); if (issue === "server_changed" && calls > 1) status.state!.reportRevision++; return status;
   } }), e => { assert.ok(!String(e).includes("sensitive-must-not-appear")); return true; }, issue);
   assert.equal(await readFile(`${f.root}/${row.planned_intent_id}.json`, "utf8"), before, issue);
  } finally { await rm(f.root, { recursive: true, force: true }); }
 }
});
test("downloaded worker names the unsigned interruption instead of misreporting a status failure, without requesting a signature", async () => {
 const f = await fixture(), preload = `${f.root}/status-stub.mjs`;
 try {
  await writeFile(`${f.root}/fixture.json`, JSON.stringify(f.status));
  await writeFile(preload, `import{readFile}from"node:fs/promises";const s=JSON.parse(await readFile(new URL("./fixture.json",import.meta.url),"utf8"));globalThis.fetch=async(u)=>{if(String(u)!=="${RUNNER_ORIGIN}/api/validation/status")throw Error("payment blocked");return Response.json(s);};`);
  const child = fork(fileURLToPath(new URL("../public/downloads/radar-validation-runner-v3.cjs", import.meta.url)), ["--worker"],
    { execArgv: ["--import", preload], stdio: ["ignore", "pipe", "pipe", "ipc"], serialization: "advanced", env: { ...process.env, NODE_OPTIONS: "" } });
  let output = "", signs = 0; child.stderr?.on("data", c => { output += c; }); child.on("message", () => { signs++; });
  const done = new Promise<number | null>((resolve, reject) => { const timer=setTimeout(()=>{child.kill();reject(new Error("timeout"));},10000); child.once("error",reject); child.once("close",c=>{clearTimeout(timer);resolve(c);}); });
  child.send({ type: "init", bundle: f.bundle, root: f.root }); assert.equal(await done, 1); assert.equal(signs, 0);
  assert.match(output, /planned-0102 本机账单校验/); assert.match(output, /--repair-unsigned planned-0102/);
  assert.ok(!output.includes("sensitive"));
 } finally { await rm(f.root, { recursive: true, force: true }); }
});


test("downloaded repair CLI completes from the real entrypoint without a key prompt or payment request", async () => {
 const f = await fixture(), privateRoot = `${f.root}/.radar-agent-local`, runRoot = `${privateRoot}/${f.bundle.runnerId}`;
 try {
  await privateDirectory(privateRoot); await privateDirectory(runRoot);
  await writePrivateJson(`${runRoot}/${prior.planned_intent_id}.json`, f.accepted);
  await writePrivateJson(`${runRoot}/${row.planned_intent_id}.json`, f.original);
  await writePrivateJson(`${runRoot}/.signing-permits.json`, f.permits);
  await writePrivateJson(`${f.root}/bundle.json`, f.bundle); await writePrivateJson(`${f.root}/status.json`, f.status);
  const preload = `${f.root}/cli-stub.mjs`;
  await writeFile(preload, `import os from "node:os";import{syncBuiltinESMExports}from"node:module";import{readFile}from"node:fs/promises";
    os.homedir=()=>${JSON.stringify(f.root)};syncBuiltinESMExports();
    const s=JSON.parse(await readFile(new URL("./status.json",import.meta.url),"utf8"));
    globalThis.fetch=async(u,init)=>{if(String(u)!=="${RUNNER_ORIGIN}/api/validation/status"||init?.body)throw Error("non-read request blocked");return Response.json(s);};`);
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", preload,
    fileURLToPath(new URL("../public/downloads/radar-validation-runner-v3.cjs", import.meta.url)), "--repair-unsigned", row.planned_intent_id,
    "--bundle", `${f.root}/bundle.json`, "--proxy", "direct"], { timeout: 15000 });
  assert.match(stdout, /原记录已备份/); assert.match(stdout, /未提交任何付款/); assert.ok(!stdout.includes("请输入专用测试钱包私钥"));
  assert.equal((await readPrivateJson<PrivateJournal>(`${runRoot}/${row.planned_intent_id}.json`))?.state, "unsigned_interrupted");
  assert.ok(!(await readdir(runRoot)).includes(".runner-lock"));
 } finally { await rm(f.root, { recursive: true, force: true }); }
});

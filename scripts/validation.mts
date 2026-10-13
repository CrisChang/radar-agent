import { readFile, writeFile, rename, mkdir, rmdir, open, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, STAGES, SCHEDULE_SHA256, dueTime } from "../lib/validation-plan";
import { runPlannedPayment, type PrivateJournal, type RunnerDependencies } from "../lib/validation-runner";

const args = process.argv.slice(2);
function argument(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
const stage = Number(argument("--stage") ?? "1"), terms = STAGES.find(x => x.stage === stage);
if (!terms) throw new Error("Use --stage 1, 2 or 3");
if (!args.includes("--execute")) {
  console.log(JSON.stringify({ mode: "dry_run_no_network_no_signer", campaign: CAMPAIGN_ID, schedule_sha256: SCHEDULE_SHA256,
    stage, new_payments: terms.count, payment_budget_atomic: terms.amountAtomic, rows: PAYMENT_SCHEDULE.filter(x => x.stage === stage),
    note: "Live execution requires an owner-approved server stage plus an explicit local signer adapter. No funding is automatic." }, null, 2));
  process.exit(0);
}
const origin = argument("--origin"), payer = argument("--payer"), seller = argument("--seller"), adapter = argument("--signer-module"), directory = argument("--journal-dir");
if (!origin || !payer || !seller || !adapter || !directory || !/^0x[\da-f]{40}$/i.test(payer) || !/^0x[\da-f]{40}$/i.test(seller)) throw new Error("Live mode requires --origin, --payer, --seller, --signer-module and --journal-dir");
if (origin !== new URL(origin).origin || new URL(origin).protocol !== "https:") throw new Error("Pin the exact HTTPS production origin");
const root = resolve(directory); await mkdir(root, { recursive: true, mode: 0o700 });
const directoryStat = await lstat(root);
if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (directoryStat.mode & 0o077) !== 0) throw new Error("Use a dedicated private journal directory with permissions 0700");
if (args.includes("--auto-restart") && !args.includes("--worker")) {
  const { spawn } = await import("node:child_process");
  let stopped = false; process.once("SIGINT", () => { stopped = true; });
  while (!stopped) {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...args, "--worker"], { stdio: "inherit" });
    const code = await new Promise<number>(resolve => child.once("close", code => resolve(code ?? 1)));
    if (code !== 75) { process.exitCode = code; break; }
  }
  process.exit(process.exitCode ?? 0);
}
const lock = resolve(root, ".runner-lock");
try { await mkdir(lock, { mode: 0o700 }); } catch { throw new Error("Another runner or an interrupted run holds the journal lock. Inspect the process and reconcile before manually releasing it"); }
let saveQueue = Promise.resolve();
try {
  const status = await fetch(`${origin}/api/validation/status`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!status.ok) throw new Error("Campaign status unavailable");
  const { state } = await status.json() as { state?: { stage: number; halted: boolean; expiresAt: number; stage3StartedAt: number } };
  if (!state || state.stage !== stage || state.halted || state.expiresAt <= Date.now()) throw new Error("Requested stage is not approved, is halted, or has expired");
  // This opt-in module is chosen and controlled by the user. The runner never
  // discovers credentials, loads .env files, or sends keys to the server.
  const module = await import(pathToFileURL(resolve(adapter)).toString());
  const signer = await module.createSigner({ payer, seller, campaignId: CAMPAIGN_ID, stage, maximumAtomic: terms.amountAtomic }) as RunnerDependencies["signer"];
  if (signer.address.toLowerCase() !== payer.toLowerCase()) throw new Error("Local signer address differs from the pinned payer");
  const bootId = randomUUID();
  for (const row of PAYMENT_SCHEDULE.filter(x => x.stage === stage)) {
    const due = dueTime(row, state.stage3StartedAt);
    while (due > Date.now()) {
      if (!args.includes("--wait")) { console.log(JSON.stringify({ waiting_for: row.planned_intent_id, not_before: new Date(due).toISOString() })); process.exitCode = 0; break; }
      await new Promise(r => setTimeout(r, Math.min(30_000, due - Date.now())));
    }
    if (due > Date.now()) break;
    const result = await runPlannedPayment(row, { origin, payer, seller, signer, bootId,
      async load(id) { try { return JSON.parse(await readFile(resolve(root, `${id}.json`), "utf8")) as PrivateJournal; }
        catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } },
      save(journal) { const text = JSON.stringify(journal), path = resolve(root, `${journal.intent}.json`);
        saveQueue = saveQueue.then(async () => { await writeFile(`${path}.pending`, text, { mode: 0o600, flag: "wx" });
          const file = await open(`${path}.pending`, "r+"); try { await file.sync(); } finally { await file.close(); }
          await rename(`${path}.pending`, path);
          const directory = await open(root, "r"); try { await directory.sync(); } finally { await directory.close(); } }); return saveQueue; } });
    console.log(JSON.stringify({ intent: row.planned_intent_id, amount_usdc: row.amount_usdc, state: result.state,
      attempts: result.journal.attempts.length, note: "HTTP acceptance is not chain settlement" }));
    if (["restart_required", "session_checkpoint"].includes(result.state)) {
      console.log("Controlled session/restart checkpoint: process is exiting. The next process resumes the original saved journal."); process.exitCode = 75; break;
    }
  }
} catch (e) {
  // Do not print a third-party error or signer stack that could contain a key/signature.
  const message = e instanceof Error ? e.message : "";
  const safe = /^(Campaign status|Requested stage|Local signer address|Payment outcome|Private journal|Signing outcome|Frozen quote|Intent unavailable|Receipt or exact|Wrong payer|Pin an HTTPS)/.test(message);
  console.error(safe ? message : "Runner stopped. Inspect private journals and reconcile; no replacement authorization will be created.");
  process.exitCode = 1;
} finally { await saveQueue; await rmdir(lock); }

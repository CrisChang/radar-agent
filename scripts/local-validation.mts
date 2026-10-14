/** OWNER-RUN ONLY. Never invoke --execute or handle a real key from an assistant. */
import { readFile, lstat, chmod, mkdir, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fork, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { handoffDigest, validateHandoffBundle, stageThreeRows, RUNNER_ORIGIN, type HandoffBundle } from "../lib/validation-handoff";
import { localSigningPermit, addSigningPermit, validateSigningPermits, type SigningPermit } from "../lib/validation-local-policy";
import { privateDirectory, readPrivateJson, writePrivateJson } from "../lib/validation-local-files";
import { runPlannedPayment, type PrivateJournal } from "../lib/validation-runner";
import { effectiveDueTime, validateTimingAmendment, accelerationMessage, type TimingAmendment } from "../lib/validation-timing";
import { campaignTypedData, inspectCampaignPayment } from "../lib/validation-authorization";
import { getArcConfig } from "../lib/arc";
import { selectNetwork, createRunnerNetwork, RunnerNetworkError, readRunnerStatus, type NetworkChoice } from "../lib/validation-local-network";
const RUNNER_VERSION = "2026-10-14-accelerated-v3";
let accelerated = false;
let network = createRunnerNetwork({ source: "direct" });

class LocalRunnerError extends Error {}
type StageState = { timingAmendment?: TimingAmendment; lastClaimAt?: number; stage: number; halted: boolean; expiresAt: number; stage3StartedAt: number; executionMode?: string; runnerId?: string;
  bundleHash?: string; handoffCount?: number; reservedCount: number; maximumCount: number; maximumAtomic: string };
async function liveState(bundle: HandoffBundle): Promise<StageState> {
  const { state } = await readRunnerStatus(network, message => console.log(message)) as { state: StageState };
  if (!state || state.stage !== 3 || state.halted || state.expiresAt <= Date.now() || state.executionMode !== "local" ||
      state.runnerId !== bundle.runnerId || state.bundleHash !== await handoffDigest(bundle) || state.handoffCount !== bundle.reservedCount ||
      state.maximumCount !== 1000 || state.maximumAtomic !== "232600" || !Number.isFinite(state.stage3StartedAt) || state.stage3StartedAt <= 0) throw new LocalRunnerError("服务端接管包、预算或有效期不符。请在原网页核查，禁止直接新建付款。");
  if (state.timingAmendment) {
    validateTimingAmendment(state.timingAmendment, state.stage3StartedAt);
    if (!accelerated) throw new LocalRunnerError("本轮已启用快速计划。请用 --accelerate 续跑同一份原记录，不能回到旧时间规则。");
  }
  return state;
}
async function hiddenKey(signal: AbortSignal): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new LocalRunnerError("私钥必须由本人在本机交互终端隐藏输入，不能从管道或文件读取。");
  process.stdout.write("请输入专用测试钱包私钥（输入不显示，粘贴后回车；不会保存）： ");
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const end = (error?: Error) => { process.stdin.off("data", data); signal.removeEventListener("abort", aborted); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
      if (error) { value = ""; reject(error); } else resolve(value); };
    const data = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003" || char === "\u0004") { end(new LocalRunnerError("已取消，本次没有提交付款。")); return; }
        if (char === "\r" || char === "\n") { end(); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1); else value += char;
        if (value.length > 256) { end(new LocalRunnerError("输入格式不符，未读取有效私钥。")); return; }
      }
    };
    const aborted = () => end(new LocalRunnerError("已停止，未启动新付款。"));
    process.stdin.on("data", data); signal.addEventListener("abort", aborted, { once: true }); if (signal.aborted) aborted();
  });
}
async function importJournals(bundle: HandoffBundle, root: string) {
  for (const imported of bundle.journals) {
    const path = join(root, `${imported.intent}.json`), old = await readPrivateJson<PrivateJournal>(path);
    if (!old) await writePrivateJson(path, imported);
    else if (old.intent !== imported.intent || old.campaign !== imported.campaign || old.origin !== imported.origin ||
      old.payer !== imported.payer || old.seller !== imported.seller || old.amountAtomic !== imported.amountAtomic ||
      (imported.paymentHeader && (old.paymentHeader !== imported.paymentHeader || old.nonce !== imported.nonce))) throw new LocalRunnerError("接管包与本机续跑记录冲突；原记录不覆盖。");
  }
}
async function worker(bundle: HandoffBundle, root: string) {
  validateHandoffBundle(bundle);
  const bootId = randomUUID(), pending = new Map<string, { resolve(value: `0x${string}`): void; reject(e: Error): void; timer: NodeJS.Timeout }>();
  process.on("message", (raw: unknown) => {
    const m = raw as { type: string; id: string; signature?: `0x${string}` };
    if (m?.type !== "signature") return; const p = pending.get(m.id); if (!p) return;
    clearTimeout(p.timer); pending.delete(m.id); if (m.signature) p.resolve(m.signature); else p.reject(new LocalRunnerError("本机签名被拒绝。"));
  });
  process.on("disconnect", () => process.exit(1));
  let saveQueue = Promise.resolve();
  let phase = "工作进程初始状态查询";
  console.log(`工作进程已启动；${network.description}。正在只读核对进度…`);
  try {
    await liveState(bundle);
    for (const row of stageThreeRows()) {
      const path = join(root, `${row.planned_intent_id}.json`), existing = await readPrivateJson<PrivateJournal>(path);
      if (existing) {
        // Validate immutable scope and authorization before skipping accepted work.
        validateHandoffBundle({ ...bundle, journals: [existing] });
        if (existing.state === "accepted") continue;
      }
      phase = `${row.planned_intent_id} 付款前只读状态查询`;
      const current = await liveState(bundle), due = effectiveDueTime(row, current);
      if (due > Date.now()) console.log(`${row.planned_intent_id} 等待${current.timingAmendment ? "快速计划" : "原计划"}时间 ${new Date(due).toLocaleString()}（自动等待）`);
      while (due > Date.now()) await new Promise(r => setTimeout(r, Math.min(30_000, due - Date.now())));
      if (due > Date.now() - 30_000) await liveState(bundle);
      phase = `${row.planned_intent_id} ${existing?.paymentHeader ? "原授权重放" : "报价／签名／提交"}`;
      console.log(`准备 ${row.planned_intent_id} / ${row.amount_usdc} USDC / ${existing?.paymentHeader ? "沿用已保存的原授权" : "获取报价后按固定预算签名"}`);
      const result = await runPlannedPayment(row, { origin: bundle.origin, payer: bundle.payer, seller: bundle.seller, bootId, runnerId: bundle.runnerId, fetcher: network.fetcher,
        signer: { address: bundle.payer as `0x${string}`, async signTypedData(params) {
          const id = randomUUID();
          return new Promise<`0x${string}`>((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new LocalRunnerError("签名确认超时，保留未决记录。")); }, 60_000);
            pending.set(id, { resolve, reject, timer }); process.send!({ type: "sign", id, intent: row.planned_intent_id, params });
          });
        } },
        load() { return readPrivateJson<PrivateJournal>(path); },
        save(journal) { const snapshot = structuredClone(journal); saveQueue = saveQueue.then(() => writePrivateJson(path, snapshot)); return saveQueue; } });
      console.log(`${row.planned_intent_id} / ${row.amount_usdc} USDC / ${result.state}（HTTP 接收不等于链上核实）`);
      if (["restart_required", "session_checkpoint"].includes(result.state)) { await saveQueue; return 75; }
    }
    await saveQueue; return 0;
  } catch (error) {
    console.error(`停止步骤：${phase}`);
    if (error instanceof RunnerNetworkError || error instanceof LocalRunnerError) console.error(error.message);
    else if (network.lastError()) console.error(network.lastError());
    console.error("执行已停止：请保留接管包和本机记录，到网页做只读核查。未知付款不会自动换 nonce 或重签。");
    return 1;
  } finally { for (const p of pending.values()) clearTimeout(p.timer); }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--worker")) {
    if (!process.send) throw new LocalRunnerError("工作进程必须由本机主程序启动。");
    process.once("message", async (raw: unknown) => {
      const m = raw as { type: string; bundle: HandoffBundle; root: string; network?: NetworkChoice; accelerated?: boolean };
      if (m?.type !== "init") process.exit(1);
      try { accelerated = m.accelerated === true; network = createRunnerNetwork(m.network ?? { source: "direct" }); const code = await worker(m.bundle, m.root); process.exit(code); } catch { process.exit(1); }
    }); return;
  }
  if (Number(process.versions.node.split(".")[0]) < 22) throw new LocalRunnerError("请先安装 Node.js 22 或更新版本：https://nodejs.org/en/download");
  if (args.includes("--version")) { console.log(RUNNER_VERSION); return; }
  if (args.includes("--help")) { console.log("macOS 本机执行：--check 只读预检；--network-check 仅测试联网；--proxy http://127.0.0.1:端口 指定 HTTP 代理（或 direct 直连）；--execute 本人确认后启动；--accelerate 明确改为至少 5 秒间隔快速续跑（只改后续时间，不增加预算）；--offline-check 离线检查；--bundle 路径 指定原接管包。私钥只能在执行时隐藏输入。按 Ctrl+C 停止，原记录保留。"); return; }
  const allowed = new Set(["--check", "--execute", "--offline-check", "--bundle", "--network-check", "--proxy", "--accelerate"]);
  for (let i = 0; i < args.length; i++) { if (!allowed.has(args[i])) throw new LocalRunnerError("未知参数，请运行 --help；不要把私钥写进命令。"); if (["--bundle", "--proxy"].includes(args[i]) && !args[++i]) throw new LocalRunnerError("--bundle 或 --proxy 后需要填写对应路径或代理地址。"); }
  accelerated = args.includes("--accelerate");
  const proxyArg = args.indexOf("--proxy");
  const choice = await selectNetwork(proxyArg >= 0 ? args[proxyArg + 1] : undefined);
  network = createRunnerNetwork(choice);
  console.log(`Radar 本机脚本 ${RUNNER_VERSION}；Node ${process.versions.node}；${network.description}`);
  if (args.includes("--network-check")) {
    if (args.includes("--execute")) throw new LocalRunnerError("仅联网检查不能同时执行付款。");
    for (let n = 1; n <= 3; n++) {
      const data = await readRunnerStatus(network, message => console.log(message));
      if (data.storage_status !== "available") throw new LocalRunnerError("已连接网站，但服务端存储状态尚未就绪。");
      console.log(`只读联网检查 ${n}/3 通过。`);
    }
    console.log("联网检查通过；没有读取接管包、私钥，也没有付款。"); return;
  }
  const fileArg = args.indexOf("--bundle"), file = resolve(fileArg >= 0 ? args[fileArg + 1] : join(homedir(), "Downloads", "radar-local-handoff.json"));
  let stat;
  try { stat = await lstat(file); } catch { throw new LocalRunnerError("未找到接管包。请在原 Chrome 下载 radar-local-handoff.json 到下载目录，或用 --bundle 指定原文件路径。"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_777_216) throw new LocalRunnerError("接管文件格式不符。");
  let bundle: HandoffBundle;
  try { bundle = validateHandoffBundle(JSON.parse(await readFile(file, "utf8")) as HandoffBundle); }
  catch { throw new LocalRunnerError("接管包校验不通过。请在原 Chrome 完成只读核查后重新下载原包，不要修改或删除原记录。"); }
  if (args.includes("--offline-check")) {
    if (args.includes("--execute")) throw new LocalRunnerError("离线检查不能执行付款。");
    console.log("离线接管包格式检查通过；未连接网络、未读取私钥、未付款。"); return;
  }
  console.log("接管文件格式检查通过，正在联网核对服务端绑定…");
  const state = await liveState(bundle);
  console.log(`接管检查通过：Arc 5042；付款 ${bundle.payer}；收款 ${bundle.seller}。`);
  console.log(`第三阶段固定上限 900 笔 / 0.209340 USDC；目前累计预留 ${state.reservedCount} 笔。原计划最晚开放时间 ${new Date(state.stage3StartedAt + 86_400_000).toLocaleString()}。`);
  if (accelerated) console.log(`快速续跑：后续新付款间隔至少 5 秒，保持单笔未决保护。${state.timingAmendment ? "已启用，将沿用原变更。" : "尚未启用；只有 --execute 中本人确认并签署时间计划变更后才生效。"} 不再宣称完成原 24 小时计划。`);
  if (!args.includes("--execute")) { console.log("只读检查完成，无付款。启动请使用 --execute；私钥只在本机隐藏输入。"); return; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new LocalRunnerError("只能由本人在本机交互终端启动。");
  const parent = join(homedir(), ".radar-agent-local"); await privateDirectory(parent);
  const root = join(parent, bundle.runnerId); await privateDirectory(root);
  const lock = join(root, ".runner-lock");
  try { await mkdir(lock, { mode: 0o700 }); } catch { throw new LocalRunnerError("已有运行进程或上次意外中断留下执行锁。先核查，不能删除付款记录重来。"); }
  let active: ChildProcess | undefined, closed: Promise<number> | undefined, stopped = false;
  const controller = new AbortController();
  const stop = () => { stopped = true; controller.abort(); active?.kill("SIGTERM"); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    await chmod(file, 0o600); await importJournals(bundle, root);
    console.log(`本机账单文件保存在 ${root}；付款时只向固定测试接口发送该笔授权。程序不充值、不授权代币；结果不确定即停止。`);
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try { answer = await prompt.question(accelerated ? "确认按原预算快速续跑，并公开原 24 小时时间计划变更？请输入 FAST： " : "确认由本机按原预算自动签名并付款？请输入 RUN： ", { signal: controller.signal }); }
    finally { prompt.close(); }
    if (answer.trim() !== (accelerated ? "FAST" : "RUN") || stopped) throw new LocalRunnerError("已取消，没有启动付款。");
    let key = (await hiddenKey(controller.signal)).trim();
    if (/^[0-9a-f]{64}$/i.test(key)) key = `0x${key}`;
    if (!/^0x[0-9a-f]{64}$/i.test(key)) { key = ""; throw new LocalRunnerError("私钥格式不符，已停止。"); }
    let signer: ReturnType<typeof privateKeyToAccount>;
    try { signer = privateKeyToAccount(key as `0x${string}`); } finally { key = ""; }
    if (signer.address.toLowerCase() !== bundle.payer.toLowerCase()) throw new LocalRunnerError("私钥对应的账户不是指定付款钱包，已停止。");
    const guardPath = join(root, ".signing-permits.json");
    let permits = validateSigningPermits(await readPrivateJson<SigningPermit[]>(guardPath) ?? []);
    const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
    // Import old authorization digests into the signing guard: one intent can
    // never receive a fresh nonce, even after a process or machine restart.
    for (const j of bundle.journals.filter(j => j.paymentHeader)) {
      const p = inspectCampaignPayment(j.paymentHeader!, stageThreeRows().find(r => r.planned_intent_id === j.intent)!, { arc, origin: bundle.origin, payer: bundle.payer, seller: bundle.seller });
      const { hashTypedData } = await import("viem");
      permits = addSigningPermit(permits, { intent: j.intent, digest: hashTypedData(campaignTypedData(p.payload.authorization, arc)), authorization: p.payload.authorization });
    }
    await writePrivateJson(guardPath, permits);
    if (accelerated && !stopped) {
      const current = await liveState(bundle);
      if (!current.timingAmendment && current.reservedCount < 1000) {
        const timestamp = String(Math.floor(Date.now() / 1000)), bundleHash = await handoffDigest(bundle);
        const message = accelerationMessage(bundle.origin, bundle.runnerId, bundleHash, current.reservedCount, timestamp);
        console.log(`确认后续第 ${current.reservedCount + 1} 至 1000 笔切换至至少 5 秒间隔；正在提交免费时间计划变更签名…`);
        const signature = await signer.signMessage({ message });
        if (stopped) throw new LocalRunnerError("已停止，未提交时间计划变更。");
        const response = await network.fetcher(`${bundle.origin}/api/validation/control`, {
          method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "accelerate", runnerId: bundle.runnerId, bundleHash, reservedCount: current.reservedCount, timestamp, signature }) });
        if (!response.ok) throw new LocalRunnerError("快速计划未确认；请只读核查后沿用原记录，不要新建接管包。");
      }
      const amended = await liveState(bundle);
      if (amended.reservedCount < 1000 && !amended.timingAmendment) throw new LocalRunnerError("快速计划尚未生效，已停止。");
      if (amended.timingAmendment) {
        await writePrivateJson(join(root, ".timing-amendment.json"), amended.timingAmendment);
        console.log(`快速计划已确认，从第 ${amended.timingAmendment.fromOrdinal} 笔起生效；已成功付款自动跳过，金额和原记录不变。`);
      }
    }
    while (!stopped) {
      await liveState(bundle);
      if (stopped) break;
      active = fork(process.argv[1], ["--worker"], { stdio: ["ignore", "inherit", "inherit", "ipc"], serialization: "advanced", env: { ...process.env, NODE_OPTIONS: "" } });
      const child = active; let signQueue = Promise.resolve();
      child.on("message", (raw: unknown) => {
        const m = raw as { type: string; id: string; intent: string; params: ReturnType<typeof campaignTypedData> };
        if (m?.type !== "sign") return;
        signQueue = signQueue.then(async () => {
          try {
            if (stopped) throw new LocalRunnerError("Stopped");
            const current = await liveState(bundle), permit = localSigningPermit(m.intent, m.params, bundle, current);
            if (stopped) throw new LocalRunnerError("Stopped");
            const next = addSigningPermit(permits, permit);
            await writePrivateJson(guardPath, next); permits = next; // Durable reservation before producing any signature.
            if (stopped) throw new LocalRunnerError("Stopped");
            const signature = await signer.signTypedData(campaignTypedData(permit.authorization, arc));
            if (child.connected) child.send({ type: "signature", id: m.id, signature });
          } catch { if (child.connected) child.send({ type: "signature", id: m.id }); }
        });
      });
      closed = new Promise<number>(resolve => { let failed = false; child.once("error", () => { failed = true; }); child.once("close", code => resolve(failed ? 1 : code ?? 1)); });
      child.send({ type: "init", bundle, root, network: choice, accelerated }); const code = await closed; await signQueue; active = undefined;
      if (stopped) break;
      if (code === 75) { console.log("测试检查点：自动重启工作进程，沿用原授权。"); continue; }
      process.exitCode = code;
      if (code === 0) console.log(`全部计划请求已处理。请打开 ${RUNNER_ORIGIN}/validation 做最终只读核查；尚不能据此宣称链上全部成功。`);
      break;
    }
    if (stopped) console.log("已停止后续请求。再次运行同一命令会读取原记录；不要删除账单目录。");
  } finally {
    if (active) { active.kill("SIGTERM"); await closed; }
    process.off("SIGINT", stop); process.off("SIGTERM", stop); await rmdir(lock);
  }
}
main().catch(error => {
  console.error((error instanceof LocalRunnerError || error instanceof RunnerNetworkError) ? error.message : "准备或执行未完成：网络、权限或原记录检查失败。请保留记录，到网页只读核查；不要发送私钥或接管包。");
  process.exitCode = 1;
});

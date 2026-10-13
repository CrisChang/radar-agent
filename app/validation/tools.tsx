"use client";
import { useEffect, useRef, useState } from "react";
import { createWalletClient, custom, defineChain, type EIP1193Provider } from "viem";
import type { ArcConfig } from "@/lib/arc";
import { CAMPAIGN_ID, SCHEDULE_SHA256, AMOUNT_TIERS, PAYMENT_SCHEDULE, STAGES, approvalMessage, dueTime, formatAtomic } from "@/lib/validation-plan";
import { controlMessage } from "@/lib/validation-messages";
import { billingMessage } from "@/lib/billing-auth";
import { runPlannedPayment, type PrivateJournal } from "@/lib/validation-runner";
import CampaignFunding from "./funding";
import baseline from "@/data/mainnet-batch-baseline.json";

interface State { stage: number; reservedCount: number; reservedAtomic: string; expiresAt: number; halted: boolean; verifiedCount: number; stage3StartedAt: number }
interface Row { intent: string; stage: number; scenario: string; amount_usdc: string; amount_atomic: string; scenario_passed: boolean | null; money_difference_atomic: string | null; local_state: string; transfer_status: string | null; batch_hash: string | null; proof: string; http_attempts: number }
interface Report { status: string; completed_payments: number; attempted_payments: number; http_attempts: number; batch_transactions: number; money_difference_atomic: string | null; overall_passed: boolean | null; generated_at: string | null; conclusion: string; rows: Row[] }
function injected(): EIP1193Provider {
  const w = window as Window & { ethereum?: EIP1193Provider; okxwallet?: EIP1193Provider };
  const p = w.okxwallet ?? w.ethereum; if (!p) throw new Error("未检测到钱包，请使用装有 EVM 钱包的浏览器。"); return p;
}
export default function ValidationTools({ arc, payer, seller }: { arc: ArcConfig; payer: string; seller: string }) {
  const [wallet, setWallet] = useState<string>(), [state, setState] = useState<State | null>(null), [report, setReport] = useState<Report>(),
    [message, setMessage] = useState("尚未开始主网测试。连接钱包本身不会付款。"), [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false), [page, setPage] = useState(0);
  const stop = useRef(false), bootId = useRef("");
  useEffect(() => { bootId.current = crypto.randomUUID(); void refresh(); }, []);
  async function refresh() {
    try {
      const response = await fetch("/api/validation/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Evidence unavailable");
      const data = await response.json(); setReport(data.report); setState(data.state); return data.state as State | null;
    } catch { setMessage("暂时无法读取真实记录；不能据此判定成功或零差异。"); return null; }
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return; setBusy(true);
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message.slice(0, 300) : "操作未完成，请先对账。"); }
    finally { setBusy(false); await refresh(); }
  }
  async function account() {
    const provider = injected(), accounts = await provider.request({ method: "eth_accounts" });
    if (accounts[0]?.toLowerCase() !== payer.toLowerCase()) throw new Error("请在钱包中选择指定付款账户，再连接。");
    if (Number(await provider.request({ method: "eth_chainId" })) !== 5042) throw new Error("请切换到 Arc Mainnet，链 ID 5042。");
    const chain = defineChain({ id: 5042, name: "Arc Mainnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [arc.rpcUrl] } } });
    return createWalletClient({ account: payer as `0x${string}`, chain, transport: custom(provider) });
  }
  async function connect() {
    const accounts = await injected().request({ method: "eth_requestAccounts" }); setWallet(accounts[0]); setConsent(false);
    await account(); setMessage("付款账户和 Arc 网络已核对，尚未批准测试预算。");
  }
  async function control(action: "approve" | "reconcile" | "pause" | "resume", stage?: number) {
    const client = await account(), timestamp = Math.floor(Date.now() / 1000).toString();
    const message = action === "approve" ? approvalMessage(location.origin, payer, seller, stage!, timestamp) : controlMessage(location.origin, action, timestamp);
    const signature = await client.signMessage({ message });
    const response = await fetch("/api/validation/control", { method: "POST", cache: "no-store", redirect: "error",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ action, stage, timestamp, signature }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "阶段操作失败，未发起新付款。");
    setConsent(false); await refresh();
    setMessage(action === "approve" ? "阶段预算已批准。点击运行后，钱包仍会逐笔要求付款签名。" : action === "pause" ? "已暂停新付款，历史签名和账单仍保留。" : action === "resume" ? "已核实并恢复当前阶段，新付款仍受原预算和有效期限制。" : "只读对账已完成，请查看下方真实结果。");
  }
  async function runStage() {
    if (!consent) throw new Error("请核对并勾选本阶段付款预算。");
    const client = await account(), current = await refresh();
    if (!current || current.halted || current.expiresAt < Date.now()) throw new Error("阶段未批准、已暂停或已过期。");
    if (!navigator.locks) throw new Error("浏览器不支持安全运行锁，请使用当前版本 Chrome。");
    stop.current = false;
    const sessionId = crypto.randomUUID();
    await navigator.locks.request(`${CAMPAIGN_ID}:${payer}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("另一个标签页正在运行，请不要重复启动。");
      let saveQueue = Promise.resolve();
      const key = (id: string) => `radar:private-validation:${location.origin}:${payer.toLowerCase()}:${CAMPAIGN_ID}:${id}`;
      for (const row of PAYMENT_SCHEDULE.filter(r => r.stage === current.stage)) {
        if (stop.current) { setMessage("已停止本机运行；未提交的付款不会继续。请对账。"); return; }
        const due = dueTime(row, current.stage3StartedAt);
        while (due > Date.now()) {
          if (stop.current) { setMessage("已停止本机后续请求，可稍后继续。"); return; }
          setMessage(`等待分散执行时间：${row.planned_intent_id} 最早 ${new Date(due).toLocaleString()}。保持页面打开，或之后使用同一浏览器继续。`);
          await new Promise(resolve => setTimeout(resolve, Math.min(30_000, due - Date.now())));
        }
        setMessage(`处理 ${row.planned_intent_id}，${row.amount_usdc} USDC。请核对钱包签名。`);
        const result = await runPlannedPayment(row, { origin: location.origin, payer, seller, bootId: bootId.current, sessionId,
          signer: { address: payer as `0x${string}`, async signTypedData(params) { await account(); return client.signTypedData(params); } },
          async load(id) { const raw = localStorage.getItem(key(id)); return raw ? JSON.parse(raw) as PrivateJournal : null; },
          save(journal) { const raw = JSON.stringify(journal); saveQueue = saveQueue.then(() => { localStorage.setItem(key(journal.intent), raw); }); return saveQueue; } });
        if (result.state === "session_checkpoint") { setMessage("跨会话用例已完成一组 20 笔。再次点击继续会开启新运行会话，沿用原预算和账单。"); return; }
        if (result.state === "restart_required") { setMessage("本用例要求真实重启客户端：请刷新页面、重连，再运行本阶段。程序会复用已保存的原签名，不会签新付款。"); return; }
      }
      setMessage("本阶段请求已完成。请点击只读对账，等待批次上链核实后再进入下一阶段。");
    });
  }
  function download(name: string, value: string, mime: string) {
    const url = URL.createObjectURL(new Blob([value], { type: mime })), a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function privateExport(kind: "receipts" | "events") {
    const client = await account(), all: unknown[] = []; let offset: number | null = 0;
    while (offset !== null) {
      const url: URL = new URL(`/api/validation/export?kind=${kind}&offset=${offset}`, location.origin), timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await client.signMessage({ message: billingMessage({ url: url.toString(), network: arc.network, wallet: payer, timestamp }) });
      const response: Response = await fetch(url, { cache: "no-store", redirect: "error", headers: { "x-radar-wallet": payer, "x-radar-auth-timestamp": timestamp, "x-radar-auth-signature": signature } });
      if (!response.ok) throw new Error("私有记录导出未完成，不能当成完整导出。");
      const body: { items: unknown[]; next_offset: number | null } = await response.json(); all.push(...body.items); offset = body.next_offset;
    }
    download(`${CAMPAIGN_ID}-${kind}-private.json`, JSON.stringify({ campaign: CAMPAIGN_ID, kind, items: all }, null, 2), "application/json");
    setMessage(`已完整导出 ${all.length} 条${kind === "events" ? "事件" : "账单"}，包含私有归属信息，请妥善保存。`);
  }
  const next = STAGES.find(s => s.stage === (state?.stage ?? 0) + 1), current = STAGES.find(s => s.stage === state?.stage);
  const rows = report?.rows ?? [], visible = rows.slice(page * 50, page * 50 + 50);
  return <main className="tool-shell">
    <div className="tool-actions"><a href="/">Radar Agent</a><a href="/pilot">原单笔测试</a><a href="/billing">钱包账单</a><a href="/api/validation/status">公开 JSON 记录</a></div>
    <p className="eyebrow">ARC MAINNET · OWNER-CONTROLLED RELIABILITY TEST</p>
    <h1>逐笔付款，逐笔核查。</h1>
    <p className="lede">1,000 笔独立付款，10 档金额，至少 24 小时。每笔关联 Gateway 的真实结算批次，核对链上净余额变化。原先的一笔测试不计入本轮。</p>
    <div className="tool-card"><h2>真实进度 / Evidence</h2>
      <div className="validation-metrics"><p>链上核实付款<strong>{report?.completed_payments ?? "—"} / 1,000</strong></p><p>已保留付款意图<strong>{report ? state?.reservedCount ?? 0 : "—"}</strong></p><p>独立批次哈希<strong>{report?.batch_transactions ?? "—"}</strong></p><p>最大金额差异（原子单位）<strong>{report?.money_difference_atomic ?? "待核查"}</strong></p></div>
      <p>状态：{report?.status ?? "读取中"} · 最终结论：{report?.overall_passed === true ? "通过" : report?.overall_passed === false ? "失败或需复核" : "尚无最终结论"}</p>
      <p>{report?.conclusion}</p><p>最近对账：{report?.generated_at ?? "尚未对账"}。1 个 USDC 原子单位 = 0.000001 USDC，金额差异容许值为 0。</p>
      <p>同一控制人的两个钱包进行功能测试，不代表客户数、营收或项目采用量。批次哈希可能被多笔付款共用；逐笔归属依赖 Gateway 记录，链上独立核实的是批次内钱包净变动。</p>
      <button onClick={() => void refresh()}>刷新真实进度</button>
    </div>
    <div className="tool-card"><h2>此前真实付款基线（不计入本轮）</h2><p>已核实 0.001000 USDC：付款方链上净减 1,000 原子单位，收款方净增 1,000，均与 Gateway 记录完全一致，差异为 0。</p><p><a href={`${arc.explorerUrl}/tx/${baseline.hash}`} target="_blank" rel="noreferrer">查看原真实批次 {baseline.hash.slice(0, 14)}…</a> · 复核时间 {baseline.checked_at}。本次复核只读取链上记录，没有新付款。</p></div>
    <div className="tool-card"><h2>付款计划与操作</h2><p>付款钱包：<code>{payer}</code><br/>收款钱包：<code>{seller}</code><br/>网络：Arc Mainnet（5042）</p>
      <p>每档 100 笔：{AMOUNT_TIERS.map(n => formatAtomic(BigInt(n))).join(" / ")} USDC。总额 <b>0.232600 USDC</b>，充值和 gas 单独确认。</p>
      <p>阶段：10 笔 / 0.002326 USDC → 90 笔 / 0.020934 USDC → 900 笔 / 0.209340 USDC。第三阶段按固定时间分散到 24 小时，不会一次全部提交。</p>
      <p>当前连接：<code>{wallet ?? "尚未连接"}</code>。阶段 {state?.stage ?? 0}，累计已保留 {formatAtomic(state?.reservedAtomic ?? "0")} USDC，{state?.halted ? "已暂停" : "未暂停"}。</p>
      <p>浏览器逐笔弹窗签名；本机保存原付款授权用于原样重试，最长约七天有效。请使用可信电脑，不要清理本站记录或在另一台电脑重新签同一笔。暂停新请求不会撤销已经签过的付款授权。</p>
      <div className="tool-actions"><button disabled={busy} onClick={() => void perform(connect)}>连接指定钱包</button><button disabled={!wallet || busy} onClick={() => void perform(() => control("reconcile"))}>只读核查全部付款与链上批次</button><button disabled={!wallet || busy || !state} onClick={() => void perform(() => control("pause"))}>暂停服务端新付款</button><button disabled={!wallet || busy || !state?.halted} onClick={() => void perform(() => control("resume"))}>核查完成后恢复原阶段</button></div>
      <p><label><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)}/>我已核对本阶段金额、付款和收款地址，并同意固定计划内的付款及原授权重试。</label></p>
      <div className="tool-actions">{next && <button disabled={!wallet || busy || !consent || !!state?.halted || !!state && state.verifiedCount !== (current?.cumulativeCount ?? 0)} onClick={() => void perform(() => control("approve", next.stage))}>批准阶段 {next.stage}：{next.count} 笔 / {formatAtomic(next.amountAtomic)} USDC</button>}
      <button disabled={!wallet || busy || !consent || !state || state.halted} onClick={() => void perform(runStage)}>运行 / 继续当前阶段</button><button disabled={!busy} onClick={() => { stop.current = true; }}>停止本机后续请求</button></div>
      <p className="tool-notice" role="status">{message}</p>
      <CampaignFunding arc={arc} payer={payer} account={account} disabled={!wallet || busy} onMessage={setMessage}/>
    </div>
    <div className="tool-card"><h2>逐笔记录 / Results</h2><p>顺序请求、跨会话、串行重放、并发重放、受控丢弃响应及真实客户端重启。失败和重试都保留；未完成项不算成功。</p>
      <div className="tool-actions"><button disabled={!report} onClick={() => download(`${CAMPAIGN_ID}-public.json`, JSON.stringify(report, null, 2), "application/json")}>下载公开结果 JSON</button>
      <button disabled={!report} onClick={() => { const cols = ["intent", "stage", "scenario", "amount_usdc", "amount_atomic", "money_difference_atomic", "scenario_passed", "local_state", "transfer_status", "batch_hash", "proof", "http_attempts"] as const;
        const csv = [cols.join(","), ...rows.map(row => cols.map(k => `"${String(row[k] ?? "").replaceAll('"', '""')}"`).join(","))].join("\r\n"); download(`${CAMPAIGN_ID}-public.csv`, csv, "text/csv"); }}>下载全部结果 CSV</button>
      <button disabled={!wallet || busy} onClick={() => void perform(() => privateExport("receipts"))}>签名导出全部私有账单</button><button disabled={!wallet || busy} onClick={() => void perform(() => privateExport("events"))}>签名导出全部尝试和状态事件</button></div>
      <div className="table-scroll"><table><thead><tr><th>意图 / 金额</th><th>场景 / 请求次数</th><th>服务端 / Gateway</th><th>批次 / 核查</th></tr></thead><tbody>{visible.map(row => <tr key={row.intent}><td>{row.intent}<br/>{row.amount_usdc} USDC</td><td>{row.scenario}<br/>{row.http_attempts}</td><td>{row.local_state}<br/>{row.transfer_status ?? "待核查"}</td><td>{row.batch_hash ? <a href={`${arc.explorerUrl}/tx/${row.batch_hash}`} target="_blank" rel="noreferrer">{row.batch_hash.slice(0, 12)}…</a> : "尚无批次哈希"}<br/>{row.proof}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>本轮尚无已核查结果。没有用示例数据填充成功记录。</p>}
      <div className="tool-actions"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 50))}</span><button disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(p => p + 1)}>下一页</button></div>
    </div>
    <p>固定计划 SHA-256：<code>{SCHEDULE_SHA256}</code>。源码及完整操作说明见 <a href="https://github.com/CrisChang/radar-agent/blob/codex/arc-microgrants/docs/MAINNET_VALIDATION.md">测试运行手册</a>。</p>
  </main>;
}

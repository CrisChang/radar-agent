"use client";
import { useEffect, useRef, useState } from "react";
import { createWalletClient, custom, defineChain, type EIP1193Provider } from "viem";
import type { ArcConfig } from "@/lib/arc";
import { CAMPAIGN_ID, SCHEDULE_SHA256, AMOUNT_TIERS, PAYMENT_SCHEDULE, STAGES, approvalMessage, dueTime, formatAtomic, type PlannedPayment } from "@/lib/validation-plan";
import { controlMessage } from "@/lib/validation-messages";
import { billingMessage } from "@/lib/billing-auth";
import { runPlannedPayment, type PrivateJournal } from "@/lib/validation-runner";
import CampaignFunding from "./funding";
import baseline from "@/data/mainnet-batch-baseline.json";
import { connectedAddress, connectionError, connectionRequest, injectedWallet, type WalletChoice } from "@/lib/wallet-connection";
import { supplementConcurrentReplay } from "@/lib/validation-replay-client";
import { renewRejectedAuthorization } from "@/lib/validation-renewal";

interface State { stage: number; reservedCount: number; reservedAtomic: string; expiresAt: number; halted: boolean; verifiedCount: number; stage3StartedAt: number }
interface Row { intent: string; stage: number; scenario: string; amount_usdc: string; amount_atomic: string; scenario_passed: boolean | null; concurrent_evidence?: string | null; supplemental_replay_attempts?: number; money_difference_atomic: string | null; local_state: string; transfer_status: string | null; batch_hash: string | null; proof: string; http_attempts: number; verification_rejections?: number; verification_rejection_reasons?: string[]; same_nonce_renewal_checks?: number }
interface Report { status: string; completed_payments: number; scenario_verified_payments?: number; attempted_payments: number; http_attempts: number | null; batch_transactions: number; money_difference_atomic: string | null; overall_passed: boolean | null; generated_at: string | null; conclusion: string; rows: Row[] }
export default function ValidationTools({ arc, payer, seller }: { arc: ArcConfig; payer: string; seller: string }) {
  const [wallet, setWallet] = useState<string>(), [state, setState] = useState<State | null>(null), [report, setReport] = useState<Report>(),
    [message, setMessage] = useState("钱包连接功能加载中…若一直停在这里，请强制刷新页面，并允许本站运行 JavaScript。"), [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false), [page, setPage] = useState(0);
  const [walletChoice, setWalletChoice] = useState<WalletChoice>("auto"), [connectedChain, setConnectedChain] = useState<number>();
  const [clientReady, setClientReady] = useState(false);
  const [recoveryIntent, setRecoveryIntent] = useState<PlannedPayment>(), [renewalConsent, setRenewalConsent] = useState(false);
  const [replayConsent, setReplayConsent] = useState(false);
  const selectedProvider = useRef<EIP1193Provider | undefined>(undefined);
  const walletReady = wallet?.toLowerCase() === payer.toLowerCase() && connectedChain === 5042;
  const stop = useRef(false), bootId = useRef("");
  useEffect(() => {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      bootId.current = crypto.randomUUID(); setClientReady(true);
      setMessage("连接功能已就绪。请选择钱包并点击连接；连接本身不会付款。");
    } else setMessage("当前浏览器缺少安全运行支持。请使用更新后的 Chrome 打开本站；尚未连接或付款。");
    void refresh();
  }, []);
  useEffect(() => {
    const provider = selectedProvider.current; if (!provider || !wallet) return;
    const accountsChanged = (accounts: unknown) => {
      setWallet(connectedAddress(accounts)); setConsent(false);
      setMessage("钱包账户已改变。请核对指定付款地址，重新连接后再确认预算。");
    };
    const chainChanged = (chain: unknown) => {
      setConnectedChain(typeof chain === "string" ? Number(chain) : undefined); setConsent(false);
      setMessage(Number(chain) === 5042 ? "已切到 Arc 主网，请重新核对并勾选预算。" : "请在钱包中切换到 Arc Mainnet，链 ID 5042。");
    };
    provider.on?.("accountsChanged", accountsChanged); provider.on?.("chainChanged", chainChanged);
    return () => { provider.removeListener?.("accountsChanged", accountsChanged); provider.removeListener?.("chainChanged", chainChanged); };
  }, [wallet, walletChoice]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => { void refresh(); }, 10_000);
    return () => clearInterval(timer);
  }, [busy]);
  function journalKey(id: string) { return `radar:private-validation:${location.origin}:${payer.toLowerCase()}:${CAMPAIGN_ID}:${id}`; }
  useEffect(() => {
    setRecoveryIntent(undefined); setRenewalConsent(false);
    if (!clientReady || busy || !walletReady || !state) return;
    for (const row of PAYMENT_SCHEDULE.filter(r => r.stage === state.stage)) {
      try {
        const raw = localStorage.getItem(journalKey(row.planned_intent_id));
        const saved = raw ? JSON.parse(raw) as PrivateJournal : null;
        if (saved?.state === "unknown" && saved.paymentHeader && !saved.pendingRenewal) { setRecoveryIntent(row); break; }
      } catch { setMessage("原付款记录无法读取，请保留本站数据并核查；不能创建替代付款。"); break; }
    }
  }, [clientReady, busy, walletReady, state?.stage]);
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
    const provider = selectedProvider.current ?? injectedWallet(window, walletChoice), accounts = await connectionRequest(provider, "eth_accounts", undefined, 10_000);
    if (connectedAddress(accounts)?.toLowerCase() !== payer.toLowerCase()) throw new Error("请在钱包中选择指定付款账户，再连接。");
    if (Number(await connectionRequest(provider, "eth_chainId", undefined, 10_000)) !== 5042) throw new Error("请切换到 Arc Mainnet，链 ID 5042。");
    const chain = defineChain({ id: 5042, name: "Arc Mainnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [arc.rpcUrl] } } });
    return createWalletClient({ account: payer as `0x${string}`, chain, transport: custom(provider) });
  }
  async function connect() {
    setWallet(undefined); setConnectedChain(undefined); setConsent(false);
    setMessage("正在请求钱包连接，请查看 Chrome 右上角的 OKX／MetaMask 扩展弹窗。连接只读取账户，不会付款。");
    try {
      const provider = injectedWallet(window, walletChoice); selectedProvider.current = provider;
      const address = connectedAddress(await connectionRequest(provider, "eth_requestAccounts"));
      if (!address) throw new Error("钱包未返回有效账户。请解锁钱包并选择指定付款地址后重连。");
      setWallet(address); setConsent(false);
      const chain = Number(await connectionRequest(provider, "eth_chainId", undefined, 10_000)); setConnectedChain(chain);
      if (address.toLowerCase() !== payer.toLowerCase()) throw new Error("已连接的账户与付款钱包不符。请点击“选择账户”，切换到页面指定的 0xefc7…8422 后连接。");
      if (chain !== 5042) throw new Error(`已连接钱包，当前网络 ${chain}。请在扩展中切换到 Arc Mainnet（5042）。`);
      setMessage("付款账户和 Arc 网络已核对，尚未批准测试预算。");
    } catch (e) { throw new Error(connectionError(e)); }
  }
  async function chooseAccount() {
    setWallet(undefined); setConnectedChain(undefined); setConsent(false); setMessage("正在打开钱包账户选择，请查看 Chrome 右上角的钱包扩展。");
    try {
      const provider = injectedWallet(window, walletChoice); selectedProvider.current = provider;
      await connectionRequest(provider, "wallet_requestPermissions", [{ eth_accounts: {} }]);
      await connect();
    } catch (e) { throw new Error(connectionError(e)); }
  }
  async function disconnect() {
    const provider = selectedProvider.current;
    setWallet(undefined); setConnectedChain(undefined); setConsent(false); selectedProvider.current = undefined;
    if (!provider) { setMessage("页面已断开。历史付款授权与账单仍保留。"); return; }
    setMessage("正在断开钱包连接；历史付款授权、预算和账单不会清除。");
    try {
      await connectionRequest(provider, "wallet_revokePermissions", [{ eth_accounts: {} }], 10_000);
      setMessage("已断开本站连接。重新选择账户后连接即可；历史付款记录仍保留。");
    } catch { setMessage("页面已断开，钱包未确认撤销连接。请在扩展的已连接网站中断开本站，再重新连接；历史付款记录仍保留。"); }
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
      const key = journalKey;
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
  async function supplementReplays() {
    if (!replayConsent || !pendingReplays.length) throw new Error("请勾选仅复用原成功账单的补测确认。");
    if (!navigator.locks) throw new Error("请使用支持安全运行锁的 Chrome。");
    await account(); stop.current = false;
    await navigator.locks.request(`${CAMPAIGN_ID}:${payer}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("另一个标签页正在运行，请不要同时补测。");
      for (const evidence of pendingReplays) {
        if (stop.current) { setMessage("补测已停止，原付款不变。请只读核查已有结果。"); return; }
        await account();
        const row = PAYMENT_SCHEDULE.find(r => r.planned_intent_id === evidence.intent)!;
        setMessage(`正在补测 ${row.planned_intent_id}：同时读取原账单两次，无新付款、无需付款签名。`);
        await supplementConcurrentReplay(row, { origin: location.origin, payer, seller, bootId: bootId.current,
          async load(id) { const raw = localStorage.getItem(journalKey(id)); return raw ? JSON.parse(raw) as PrivateJournal : null; },
          async save(saved) { localStorage.setItem(journalKey(saved.intent), JSON.stringify(saved)); } });
      }
      setMessage("补测响应与原账单一致。下一步点击“只读核查全部付款与链上批次”，签署免费核查消息；服务端确认真实重叠后才会计为场景通过。");
    });
    setReplayConsent(false);
  }
  async function renewOriginal() {
    const row = recoveryIntent;
    if (!row || !renewalConsent) throw new Error("请核对并勾选仅延长原 nonce 的授权。");
    if (!navigator.locks) throw new Error("浏览器不支持安全运行锁，请使用更新后的 Chrome。");
    const client = await account();
    setMessage(`正在只读核查 ${row.planned_intent_id} 原授权。核查通过后才会要求续签，金额仍为 ${row.amount_usdc} USDC。`);
    await navigator.locks.request(`${CAMPAIGN_ID}:${payer}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("另一个标签页正在运行或续签，请勿同时操作。");
      await renewRejectedAuthorization(row, { origin: location.origin, payer, seller, bootId: bootId.current,
      signer: { address: payer as `0x${string}`, async signTypedData(params) {
        await account(); setMessage(`原授权核查通过。请在钱包核对 ${row.amount_usdc} USDC，同一 nonce，仅延长有效期至约七天加一小时。此步骤不提交付款。`);
        return client.signTypedData(params);
      } },
      async load(id) { const raw = localStorage.getItem(journalKey(id)); return raw ? JSON.parse(raw) as PrivateJournal : null; },
      async save(saved) { localStorage.setItem(journalKey(saved.intent), JSON.stringify(saved)); } });
    });
    setRenewalConsent(false); setConsent(false); setRecoveryIntent(undefined);
    setMessage("原 nonce 的续签已保存，尚未提交付款。重新勾选阶段预算，再点运行／继续当前阶段；已成功的付款会跳过。");
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
  const pendingReplays = rows.filter(r => r.scenario === "concurrent_same_authorization_replay" && r.scenario_passed === false &&
    r.local_state === "accepted" && r.transfer_status === "completed" && r.money_difference_atomic === "0");
  return <main className="tool-shell">
    <div className="tool-actions"><a href="/">Radar Agent</a><a href="/pilot">原单笔测试</a><a href="/billing">钱包账单</a><a href="/api/validation/status">公开 JSON 记录</a></div>
    <p className="eyebrow">ARC MAINNET · OWNER-CONTROLLED RELIABILITY TEST</p>
    <h1>逐笔付款，逐笔核查。</h1>
    <p className="lede">1,000 笔独立付款，10 档金额，至少 24 小时。每笔关联 Gateway 的真实结算批次，核对链上净余额变化。原先的一笔测试不计入本轮。</p>
    <div className="tool-card"><h2>真实进度 / Evidence</h2>
      <div className="validation-metrics"><p>链上核实付款<strong>{report?.completed_payments ?? "—"} / 1,000</strong></p><p>付款及场景均通过<strong>{report?.scenario_verified_payments ?? "—"} / 1,000</strong></p><p>已保留付款意图<strong>{report ? state?.reservedCount ?? 0 : "—"}</strong></p><p>独立批次哈希<strong>{report?.batch_transactions ?? "—"}</strong></p><p>最大金额差异（原子单位）<strong>{report?.money_difference_atomic ?? "待核查"}</strong></p></div>
      <p>状态：{report?.status ?? "读取中"} · 最终结论：{report?.overall_passed === true ? "通过" : report?.overall_passed === false ? "失败或需复核" : "尚无最终结论"}</p>
      <p>{report?.conclusion}</p><p>最近对账：{report?.generated_at ?? "尚未对账"}。1 个 USDC 原子单位 = 0.000001 USDC，金额差异容许值为 0。</p>
      <p>同一控制人的两个钱包进行功能测试，不代表客户数、营收或项目采用量。批次哈希可能被多笔付款共用；逐笔归属依赖 Gateway 记录，链上独立核实的是批次内钱包净变动。</p>
      <button onClick={() => void refresh()}>刷新真实进度</button>
    </div>
    <div className="tool-card"><h2>此前真实付款基线（不计入本轮）</h2><p>已核实 0.001000 USDC：付款方链上净减 1,000 原子单位，收款方净增 1,000，均与 Gateway 记录完全一致，差异为 0。</p><p><a href={`${arc.explorerUrl}/tx/${baseline.hash}`} target="_blank" rel="noreferrer">查看原真实批次 {baseline.hash.slice(0, 14)}…</a> · 复核时间 {baseline.checked_at}。本次复核只读取链上记录，没有新付款。</p></div>
    <div className="tool-card"><h2>付款计划与操作</h2><p>付款钱包：<code>{payer}</code><br/>收款钱包：<code>{seller}</code><br/>网络：Arc Mainnet（5042）</p>
      <p>每档 100 笔：{AMOUNT_TIERS.map(n => formatAtomic(BigInt(n))).join(" / ")} USDC。总额 <b>0.232600 USDC</b>，充值和 gas 单独确认。</p>
      <p>阶段：10 笔 / 0.002326 USDC → 90 笔 / 0.020934 USDC → 900 笔 / 0.209340 USDC。第三阶段按固定时间分散到 24 小时，不会一次全部提交。</p>
      <p>当前连接：<code>{wallet ?? "尚未连接"}</code> · 钱包网络：{connectedChain ?? "未读取"}。阶段 {state?.stage ?? 0}，累计已保留 {formatAtomic(state?.reservedAtomic ?? "0")} USDC，{state?.halted ? "已暂停" : "未暂停"}。</p>
      <p>浏览器逐笔弹窗签名；新授权有效期为七天加一小时，其中一小时用于人工核对签名。付款时保留至少七天供 Gateway 批量结算。本机保存原授权用于原样重试。请使用可信电脑，不要清理本站记录或在另一台电脑重新签同一笔。暂停新请求不会撤销已经签过的授权。</p>
      <p><label>连接的钱包： <select aria-label="连接的钱包" value={walletChoice} disabled={!clientReady || busy} onChange={e => { setWalletChoice(e.target.value as WalletChoice); setWallet(undefined); setConnectedChain(undefined); setConsent(false); selectedProvider.current = undefined; setMessage("已更换钱包类型，请点击连接。历史付款记录仍保留。"); }}><option value="auto">自动选择（优先 OKX）</option><option value="okx">OKX Wallet</option><option value="ethereum">MetaMask／浏览器 EVM 钱包</option></select></label></p>
      <p className="tool-notice" role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <noscript><p className="tool-notice">页面脚本未启用，钱包按钮无法工作。请在 Chrome 允许本站使用 JavaScript 后刷新。</p></noscript>
      <div className="tool-actions"><button disabled={!clientReady || busy} onClick={() => void perform(connect)}>{!clientReady ? "连接功能加载中…" : busy ? "处理中，请查看钱包…" : "连接指定钱包"}</button><button disabled={!clientReady || busy} onClick={() => void perform(chooseAccount)}>选择账户</button><button disabled={busy || !wallet} onClick={() => void perform(disconnect)}>断开连接</button><button disabled={!walletReady || busy} onClick={() => void perform(() => control("reconcile"))}>只读核查全部付款与链上批次</button><button disabled={!walletReady || busy || !state} onClick={() => void perform(() => control("pause"))}>暂停服务端新付款</button><button disabled={!walletReady || busy || !state?.halted} onClick={() => void perform(() => control("resume"))}>核查完成后恢复原阶段</button></div>
      <p><label><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)}/>我已核对本阶段金额、付款和收款地址，并同意固定计划内的付款及原授权重试。</label></p>
      <div className="tool-actions">{next && <button disabled={!walletReady || busy || !consent || !!state?.halted || !!state && state.verifiedCount !== (current?.cumulativeCount ?? 0)} onClick={() => void perform(() => control("approve", next.stage))}>批准阶段 {next.stage}：{next.count} 笔 / {formatAtomic(next.amountAtomic)} USDC</button>}
      <button disabled={!walletReady || busy || !consent || !state || state.halted} onClick={() => void perform(runStage)}>运行 / 继续当前阶段</button><button disabled={!busy} onClick={() => { stop.current = true; }}>停止本机后续请求</button></div>
      {pendingReplays.length > 0 && <section className="validation-funding"><h3>补做并发验证（不新增付款）</h3>
        <p>待补测：{pendingReplays.map(r => r.intent).join("、")}。这些付款已完成，本次每笔同时读取原成功账单两次，检验并发重放返回相同内容。它验证付款完成后的账单重放，不代表首次结算并发测试。</p>
        <p>请在原付款的同一 Chrome 中操作，保留本站数据。无需充值、代币授权或新付款签名；历史失败不会删除。补测后仍需只读对账确认实际请求重叠。</p>
        <p><label><input type="checkbox" checked={replayConsent} disabled={busy} onChange={e => setReplayConsent(e.target.checked)}/>仅复用本机原授权读取已成功账单，不新增付款。</label></p>
        <button disabled={!walletReady || busy || !replayConsent} onClick={() => void perform(supplementReplays)}>补做并发验证（不新增付款）</button>
      </section>}
      {recoveryIntent && <section className="validation-funding"><h3>恢复原授权：{recoveryIntent.planned_intent_id}</h3>
        <p>先只读核实原授权被 Gateway 明确以有效期不足拒绝，且原 nonce 没有转账或服务端预留。通过后才能亲自续签；金额、付款编号、双方地址和 nonce 均保留，历史授权与失败记录也保留。其他失败不允许使用此入口。</p>
        <p><label><input type="checkbox" checked={renewalConsent} disabled={busy} onChange={e => setRenewalConsent(e.target.checked)}/>我同意仅延长这笔原 nonce 授权，金额仍为 {recoveryIntent.amount_usdc} USDC，有效期约七天加一小时，不增加付款预算。</label></p>
        <button disabled={!walletReady || busy || !renewalConsent} onClick={() => void perform(renewOriginal)}>核查并延长原授权（不提交付款）</button>
      </section>}
      <CampaignFunding arc={arc} payer={payer} account={account} disabled={!walletReady || busy} onMessage={setMessage}/>
    </div>
    <div className="tool-card"><h2>逐笔记录 / Results</h2><p>顺序请求、跨会话、串行重放、并发重放、受控丢弃响应及真实客户端重启。失败和重试都保留；未完成项不算成功。</p>
      <div className="tool-actions"><button disabled={!report} onClick={() => download(`${CAMPAIGN_ID}-public.json`, JSON.stringify(report, null, 2), "application/json")}>下载公开结果 JSON</button>
      <button disabled={!report} onClick={() => { const cols = ["intent", "stage", "scenario", "amount_usdc", "amount_atomic", "money_difference_atomic", "scenario_passed", "local_state", "transfer_status", "batch_hash", "proof", "http_attempts", "verification_rejections", "verification_rejection_reasons", "same_nonce_renewal_checks", "supplemental_replay_attempts", "concurrent_evidence"] as const;
        const csv = [cols.join(","), ...rows.map(row => cols.map(k => `"${String(row[k] ?? "").replaceAll('"', '""')}"`).join(","))].join("\r\n"); download(`${CAMPAIGN_ID}-public.csv`, csv, "text/csv"); }}>下载全部结果 CSV</button>
      <button disabled={!walletReady || busy} onClick={() => void perform(() => privateExport("receipts"))}>签名导出全部私有账单</button><button disabled={!walletReady || busy} onClick={() => void perform(() => privateExport("events"))}>签名导出全部尝试和状态事件</button></div>
      <div className="table-scroll"><table><thead><tr><th>意图 / 金额</th><th>场景 / 请求次数</th><th>服务端 / Gateway</th><th>批次 / 核查</th></tr></thead><tbody>{visible.map(row => <tr key={row.intent}><td>{row.intent}<br/>{row.amount_usdc} USDC</td><td>{row.scenario}<br/>{row.http_attempts} 次请求<br/>场景：{row.scenario_passed === true ? "通过" : row.scenario_passed === false ? "待补证据" : "未运行"}{row.concurrent_evidence === "settled_receipt_replay" && <><br/>已结算账单并发补测</>}</td><td>{row.local_state}<br/>{row.transfer_status ?? "待核查"}</td><td>{row.batch_hash ? <a href={`${arc.explorerUrl}/tx/${row.batch_hash}`} target="_blank" rel="noreferrer">{row.batch_hash.slice(0, 12)}…</a> : "尚无批次哈希"}<br/>{row.proof}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>本轮尚无已核查结果。没有用示例数据填充成功记录。</p>}
      <div className="tool-actions"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 50))}</span><button disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(p => p + 1)}>下一页</button></div>
    </div>
    <p>固定计划 SHA-256：<code>{SCHEDULE_SHA256}</code>。源码及完整操作说明见 <a href="https://github.com/CrisChang/radar-agent/blob/codex/arc-microgrants/docs/MAINNET_VALIDATION.md">测试运行手册</a>。</p>
  </main>;
}

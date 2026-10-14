"use client";
import { useEffect, useState } from "react";
import type { WalletClient, Account, Chain, Transport } from "viem";
import { CAMPAIGN_ID, SCHEDULE_SHA256 } from "@/lib/validation-plan";
import { handoffDigest, handoffMessage, requireReservedJournals, stageThreeRows, type HandoffBundle } from "@/lib/validation-handoff";
import type { PrivateJournal } from "@/lib/validation-runner";
export default function LocalRunner({ payer, seller, disabled, disabledReason, handedOff, account, onMessage, onRefresh }: {
  payer: string; seller: string; disabled: boolean; disabledReason?: string; handedOff: boolean; account(): Promise<WalletClient<Transport, Chain, Account>>;
  onMessage(message: string): void; onRefresh(): Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false), [consent, setConsent] = useState(false), [note, setNote] = useState("");
  const [prepared, setPrepared] = useState<HandoffBundle>(), [downloadUrl, setDownloadUrl] = useState<string>();
  useEffect(() => {
    if (!prepared) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(prepared)], { type: "application/json" }));
    setDownloadUrl(url); return () => URL.revokeObjectURL(url);
  }, [prepared]);
  function message(value: string) { setNote(value); onMessage(value); }
  async function prepare() {
    if (busy) return;
    if (!handedOff && disabled) { message(disabledReason ?? "请先连接指定钱包，并停止网页运行。"); return; }
    if (!handedOff && !consent) { message("请先勾选本区域下方的“我已停止网页运行，同意…”，再准备接管包。"); return; }
    setBusy(true); message("正在检查接管状态…");
    try {
      if (!navigator.locks) throw new Error("请使用支持安全运行锁的 Chrome。");
      await navigator.locks.request(`${CAMPAIGN_ID}:${payer}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error("请先停止网页后续请求，等当前钱包操作结束，再接管。");
        message("正在检查完整对账与本机记录；本操作不会付款，也不会读取私钥。");
        const response = await fetch("/api/validation/status", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error("无法核实当前进度，请稍后重试。");
        const { state, report } = await response.json();
        if (!state || state.stage !== 3) throw new Error("请先批准第三阶段预算。");
        const pendingKey = `radar:private-handoff:${location.origin}:${payer.toLowerCase()}:${CAMPAIGN_ID}`;
        let bundle: HandoffBundle;
        if (state.executionMode === "local") {
          const saved = localStorage.getItem(pendingKey);
          if (!saved) throw new Error("此执行端已接管，但当前浏览器没有原接管包。请回到准备接管的浏览器下载原包。");
          bundle = JSON.parse(saved);
          if (bundle.runnerId !== state.runnerId || await handoffDigest(bundle) !== state.bundleHash) throw new Error("原接管包校验失败，请保留数据并核查。");
        } else {
          if (state.halted) throw new Error("当前阶段已暂停。请先完成只读核查，再点击“核查完成后恢复原阶段”。");
          if (state.expiresAt <= Date.now()) throw new Error("原阶段预算已过期，接管不会自动延长；请保留原记录。");
          if (report.completed_payments !== state.reservedCount || report.money_difference_atomic !== "0") throw new Error(`当前已预留 ${state.reservedCount} 笔，链上核查 ${report.completed_payments ?? 0} 笔。请先点上方“只读核查全部付款与链上批次”，等数量一致、金额差异为 0，再接管。`);
          const journals: PrivateJournal[] = [];
          for (const row of stageThreeRows()) {
            const raw = localStorage.getItem(`radar:private-validation:${location.origin}:${payer.toLowerCase()}:${CAMPAIGN_ID}:${row.planned_intent_id}`);
            if (raw) journals.push(JSON.parse(raw));
          }
          bundle = { schema: "radar-local-handoff-v1", campaign: CAMPAIGN_ID, scheduleSha256: SCHEDULE_SHA256,
            origin: location.origin, payer, seller, stage: 3, runnerId: crypto.randomUUID(), reservedCount: state.reservedCount,
            createdAt: new Date().toISOString(), journals };
          requireReservedJournals(bundle, report.rows);
          const bundleHash = await handoffDigest(bundle);
          localStorage.setItem(pendingKey, JSON.stringify(bundle)); // Save BEFORE signing or sending the handoff.
          message("记录检查通过，正在读取已连接的钱包账户…");
          const client = await account(), timestamp = Math.floor(Date.now() / 1000).toString();
          message("记录检查通过。请在钱包签署免费接管消息：保持原预算，并锁住网页新付款入口。");
          const waiting = setTimeout(() => message("还在等待免费接管消息签名。请打开 Chrome 右上角的钱包扩展，完成或取消当前请求；不要连续点击。"), 20_000);
          let signature: `0x${string}`;
          try { signature = await client.signMessage({ message: handoffMessage(location.origin, bundle.runnerId, bundleHash, bundle.reservedCount, timestamp) }); }
          finally { clearTimeout(waiting); }
          message("消息已签署，正在确认服务端接管状态…");
          const result = await fetch("/api/validation/control", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
            headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "handoff", runnerId: bundle.runnerId,
              bundleHash, reservedCount: bundle.reservedCount, timestamp, signature }) });
          const body = await result.json(); if (!result.ok) throw new Error(body.error ?? "接管状态未确认。请重试本按钮，不要重新付款。");
        }
        setPrepared(bundle);
        message("服务端接管已确认。请点击下方“下载接管文件 radar-local-handoff.json”；这是独立的下载步骤。若未看到文件，在 Chrome 按 ⌘J 检查。原付款授权请仅保留在本机。");
        setConsent(false);
      });
    } catch (e) { message(e instanceof SyntaxError ? "原记录或网络响应无法解析，请保留本站数据并重新只读核查。" : e instanceof Error ? e.message.slice(0, 250) : "接管未完成，请保留原记录。"); }
    finally { setBusy(false); await onRefresh(); }
  }
  return <section className="validation-funding"><h3>macOS 本机自动执行</h3>
    <p>先停止网页后续请求，完成只读核查，再导出接管包。使用原付款钱包和固定预算，保留原授权和失败记录，默认沿用 24 小时计划；无需逐笔点击钱包。新付款切换到本机后，网页仍可只读核查。</p>
    <p>脚本要求 Node.js 22 或更新版本。私钥仅由你在本机终端隐藏输入，不保存到文件、环境变量、网站或聊天；签名权限仍属于整个钱包，只使用专用小额测试钱包。</p>
    <p className="tool-notice">{handedOff ? "服务端已接管：可以直接核实并重新下载原包，不需要再次连接或签名。" : disabledReason ?? (!consent ? "下一步：勾选下面的接管确认，然后点击“准备本机接管包”。" : "点击准备后，会在这里显示核查、钱包签名和下载步骤。")}</p>
    <p><label><input type="checkbox" checked={consent} disabled={busy || handedOff} onChange={e => setConsent(e.target.checked)}/>我已停止网页运行，同意沿用原预算改由本机自动签名，并妥善保管含原授权的接管包。</label></p>
    <div className="tool-actions"><button disabled={busy} onClick={() => void prepare()}>{busy ? "正在准备接管…" : handedOff ? "核实并准备原接管文件" : "准备本机接管包"}</button>
      <a href="/downloads/radar-validation-runner-v3.cjs" download>下载自动执行脚本 v3（代理／可选快速续跑）</a><a href="/downloads/radar-validation-runner-v3.sha256" target="_blank" rel="noreferrer">脚本 SHA-256</a><a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">安装 Node.js</a></div>
    {downloadUrl && <p className="tool-notice"><a href={downloadUrl} download="radar-local-handoff.json" onClick={() => message("已请求浏览器下载接管文件，请按 ⌘J 确认下载完成；此按钮可重复下载原包，不会创建新付款。")}>下载接管文件 radar-local-handoff.json</a></p>}
    {note && <p className="tool-notice" role="status">{note}</p>}
    <p>可选快速续跑：先在旧终端按 Ctrl+C 停止并等到命令提示符，下载 v3，保留原接管包和账单目录。下面命令会要求输入 FAST，然后在本机隐藏输入同一测试钱包私钥。它只缩短后续等待，不增加预算；网站会公开记录时间计划变更。不要同时开多个执行进程。</p>
    <pre>caffeinate -i node ~/Downloads/radar-validation-runner-v3.cjs --execute --accelerate --proxy http://127.0.0.1:7897</pre>
    <p>v3.1 支持恢复确认未签名的中断。若提示某笔“签名中且未保存授权”，按终端显示的 --repair-unsigned 编号先核查；它不读取私钥、不付款，已有签名或未决付款不会重置。</p>
    <p>示例代理端口为 7897；直连可省略 --proxy 参数。快速模式一笔结果不确定即停止，HTTP accepted 仍需等待 Gateway 批次并只读核查。</p>
    <p>两个文件均放在“下载”目录。先检查：</p><pre>node ~/Downloads/radar-validation-runner-v3.cjs --check</pre>
    <p>v3 会读取 macOS 系统 HTTP 代理。若仍连接失败，可使用 --network-check 单独检查联网，或用 --proxy 指定代理软件的实际 HTTP／混合端口。接管包继续用原文件。</p>
    <p>检查通过后启动（Mac 接电、不合盖，终端保持打开）：</p><pre>caffeinate -i node ~/Downloads/radar-validation-runner-v3.cjs --execute</pre>
    <p>终端会先显示固定范围；输入 RUN 后，再隐藏输入测试钱包私钥。关闭终端或按 Ctrl+C 会停止。再次运行同一命令可续跑原记录；结果不确定时会停止，不能删除记录重来。全部请求完成后，回网页做最终只读核查。</p>
  </section>;
}

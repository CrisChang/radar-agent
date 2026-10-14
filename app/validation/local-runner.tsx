"use client";
import { useState } from "react";
import type { WalletClient, Account, Chain, Transport } from "viem";
import { CAMPAIGN_ID, SCHEDULE_SHA256 } from "@/lib/validation-plan";
import { handoffDigest, handoffMessage, requireReservedJournals, stageThreeRows, type HandoffBundle } from "@/lib/validation-handoff";
import type { PrivateJournal } from "@/lib/validation-runner";
export default function LocalRunner({ payer, seller, disabled, account, onMessage, onRefresh }: {
  payer: string; seller: string; disabled: boolean; account(): Promise<WalletClient<Transport, Chain, Account>>;
  onMessage(message: string): void; onRefresh(): Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false), [consent, setConsent] = useState(false), [note, setNote] = useState("");
  function message(value: string) { setNote(value); onMessage(value); }
  async function prepare() {
    if (disabled || busy || !consent) return; setBusy(true);
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
          if (state.halted || state.expiresAt <= Date.now() || report.completed_payments !== state.reservedCount || report.money_difference_atomic !== "0") throw new Error("请先点击“只读核查全部付款与链上批次”，等待已有付款全部核实、金额差异为 0，再接管。");
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
          const client = await account(), timestamp = Math.floor(Date.now() / 1000).toString();
          message("记录检查通过。请在钱包签署免费接管消息：保持原预算，并锁住网页新付款入口。");
          const signature = await client.signMessage({ message: handoffMessage(location.origin, bundle.runnerId, bundleHash, bundle.reservedCount, timestamp) });
          const result = await fetch("/api/validation/control", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
            headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "handoff", runnerId: bundle.runnerId,
              bundleHash, reservedCount: bundle.reservedCount, timestamp, signature }) });
          const body = await result.json(); if (!result.ok) throw new Error(body.error ?? "接管状态未确认。请重试本按钮，不要重新付款。");
        }
        const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: "application/json" })), a = document.createElement("a");
        a.href = url; a.download = "radar-local-handoff.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        message("接管包已下载，网页新付款已锁住。下载自动执行脚本，在同一 Mac 的终端运行下方命令；私钥只在终端隐藏输入。接管包含原付款授权，请勿上传或发到聊天。");
        setConsent(false);
      });
    } catch (e) { message(e instanceof Error ? e.message.slice(0, 250) : "接管未完成，请保留原记录。"); }
    finally { setBusy(false); await onRefresh(); }
  }
  return <section className="validation-funding"><h3>macOS 本机自动执行</h3>
    <p>先停止网页后续请求，完成只读核查，再导出接管包。使用原付款钱包和固定预算，保留原授权、失败记录及 24 小时计划；无需逐笔点击钱包。新付款切换到本机后，网页仍可只读核查。</p>
    <p>脚本要求 Node.js 22 或更新版本。私钥仅由你在本机终端隐藏输入，不保存到文件、环境变量、网站或聊天；签名权限仍属于整个钱包，只使用专用小额测试钱包。</p>
    <p><label><input type="checkbox" checked={consent} disabled={disabled || busy} onChange={e => setConsent(e.target.checked)}/>我已停止网页运行，同意沿用原预算改由本机自动签名，并妥善保管含原授权的接管包。</label></p>
    <div className="tool-actions"><button disabled={disabled || busy || !consent} onClick={() => void prepare()}>{busy ? "正在准备接管…" : "准备／重新下载本机接管包"}</button>
      <a href="/downloads/radar-validation-runner.cjs" download>下载自动执行脚本</a><a href="/downloads/radar-validation-runner.sha256" target="_blank" rel="noreferrer">脚本 SHA-256</a><a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">安装 Node.js</a></div>
    {note && <p className="tool-notice" role="status">{note}</p>}
    <p>两个文件均放在“下载”目录。先检查：</p><pre>node ~/Downloads/radar-validation-runner.cjs --check</pre>
    <p>检查通过后启动（Mac 接电、不合盖，终端保持打开）：</p><pre>caffeinate -i node ~/Downloads/radar-validation-runner.cjs --execute</pre>
    <p>终端会先显示固定范围；输入 RUN 后，再隐藏输入测试钱包私钥。关闭终端或按 Ctrl+C 会停止。再次运行同一命令可续跑原记录；结果不确定时会停止，不能删除记录重来。全部请求完成后，回网页做最终只读核查。</p>
  </section>;
}

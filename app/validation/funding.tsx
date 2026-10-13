"use client";
import { useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, type WalletClient, type Transport, type Chain, type Account } from "viem";
import type { ArcConfig } from "@/lib/arc";
import { assertFundingQuote, gatewayDepositAbi, type FundingQuote } from "@/lib/gateway-funding";
import { walletRejected } from "@/lib/wallet-rejection";
import { CAMPAIGN_ID } from "@/lib/validation-plan";
import { nextFundingJournal, reconcileFundingJournal, type FundingJournal, type FundingResult } from "@/lib/funding-reconciliation";

export default function CampaignFunding({ arc, payer, account, disabled, onMessage }: {
  arc: ArcConfig; payer: string; account: () => Promise<WalletClient<Transport, Chain, Account>>; disabled: boolean; onMessage: (s: string) => void;
}) {
  const [quote, setQuote] = useState<FundingQuote>(), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  const [recoveryHash, setRecoveryHash] = useState(""), [revokeHash, setRevokeHash] = useState(""), [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<FundingJournal | null>(null), running = useRef(false);
  const key = `radar:validation-funding:${CAMPAIGN_ID}:${payer.toLowerCase()}`;
  function message(text: string) { setNotice(text); onMessage(text); }
  function readSaved(): FundingJournal | null { return JSON.parse(localStorage.getItem(key) ?? "null"); }
  function save(value: FundingJournal) { localStorage.setItem(key, JSON.stringify(value)); setSaved(value); }
  useEffect(() => { try { setSaved(readSaved()); } catch { setNotice("本机充值记录无法读取，请保留本站数据并核查。"); } }, [key]);
  async function run(action: () => Promise<void>) {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); message("正在处理充值记录，请稍候；只读核对不会重新发送交易。");
    try {
      if (!navigator.locks) throw new Error("请使用支持安全运行锁的 Chrome。");
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error("另一个标签页正在处理充值，请勿同时操作。");
        await action();
      });
    } catch (e) {
      message(e instanceof Error && /^(Funding|Gateway|Reconcile|No top-up|Wallet|已有|请|充值|报价|暂未|授权|原|本机|另一个)/.test(e.message)
        ? e.message.slice(0, 300) : "暂未核实交易结果。原记录已保留，请稍后只读核对，不要重新发送。");
    } finally { running.current = false; setBusy(false); }
  }
  async function review() {
    await account();
    const previous = readSaved();
    if (previous && !["approval_confirmed", "approval_revoked"].includes(previous.state)) throw new Error("已有充值操作记录，请先展开下方的原交易核对；不能重复发送。");
    const response = await fetch("/api/validation/funding", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35_000) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Funding quote unavailable");
    if (!/^[1-9]\d*$/.test(body.amount_atomic) || BigInt(body.amount_atomic) > 223_600n) throw new Error("Funding quote exceeds the 0.2236 USDC maximum");
    assertFundingQuote(body, arc, payer, Date.now(), BigInt(body.amount_atomic)); setQuote(body); setConsent(false);
    message(`充值报价：${body.amount_usdc} USDC。钱包弹窗的授权额度也必须是这个金额，不要改为最大或无限。每笔 gas 最多 0.005 USDC。`);
  }
  async function reconcile(previous: FundingJournal, hash: string, revoked?: string) {
    if (!/^0x[\da-f]{64}$/i.test(hash) || revoked && !/^0x[\da-f]{64}$/i.test(revoked)) throw new Error("请填写完整原交易哈希；撤销哈希填写另一笔清零交易。");
    message("正在通过服务端只读核查原交易、区块确认和当前授权，约需数秒；不会重新发送交易。");
    const query = new URLSearchParams({ kind: previous.kind, hash, amount_atomic: previous.amount });
    if (revoked) query.set("revoke_hash", revoked);
    const response = await fetch(`/api/validation/funding-reconcile?${query}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(35_000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "暂未核实原交易，请稍后只读重试。");
    const next = reconcileFundingJournal(previous, body as FundingResult, payer, hash, revoked);
    save(next); setQuote(undefined); setConsent(false);
    if (next.state === "approval_requires_review") {
      message("授权交易已上链，但实际额度不符合精确预算。请先清零授权，再在下方填写清零交易哈希并只读核对；原记录已保留。"); return;
    }
    setRecoveryHash(""); setRevokeHash("");
    message(next.state === "approval_revoked" ? "原授权和后续清零均已核实，历史记录保留。现在可重新获取报价，亲自确认精确授权。尚未充值。"
      : next.state === "approval_confirmed" ? "精确授权已核实。重新获取充值报价，再确认 deposit 交易。"
      : "充值交易和授权归零已核实。等待 Gateway 余额入账后，再批准下一阶段。不要重复充值。");
  }
  async function send() {
    if (!quote || !consent) throw new Error("请先核对报价和充值预算。");
    const client = await account(), amount = BigInt(quote.amount_atomic);
    assertFundingQuote(quote, arc, payer, Date.now(), amount);
    const previous = readSaved(), kind = quote.approval_needed ? "approve" : "deposit";
    const pending = nextFundingJournal(previous, kind, amount); save(pending);
    let hash: `0x${string}`;
    try {
      message(`请在钱包亲自核对${kind === "approve" ? "授权" : "充值"}金额恰好 ${quote.amount_usdc} USDC，不选择最大额度。`);
      hash = await client.sendTransaction({ account: client.account, chain: client.chain,
        to: kind === "approve" ? arc.usdc : arc.gatewayWallet, value: 0n,
        data: kind === "approve" ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, amount] })
          : encodeFunctionData({ abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, amount] }),
        gas: BigInt(kind === "approve" ? quote.approval_gas_limit : quote.deposit_gas_limit), gasPrice: BigInt(quote.gas_price_wei) });
    } catch (e) {
      if (walletRejected(e)) { if (previous) save(previous); else { localStorage.removeItem(key); setSaved(null); } }
      throw e;
    }
    const submitted = { ...pending, hash, state: "submitted" }; save(submitted); setRecoveryHash(""); setRevokeHash("");
    message(`已提交 ${kind}，原交易哈希已保存：${hash}`); await reconcile(submitted, hash);
  }
  async function recover() {
    await account(); const previous = readSaved();
    if (!previous || !["approve", "deposit"].includes(previous.kind)) throw new Error("请先检查本机充值记录。");
    const hash = recoveryHash.trim() || previous.hash;
    if (!hash) throw new Error("请从钱包复制原授权或充值交易哈希。");
    await reconcile(previous, hash, revokeHash.trim() || undefined);
  }
  return <section className="validation-funding"><h3>后续阶段充值 / Optional funding</h3>
    <p>先使用现有余额完成并核查 10 笔。后续仅补足剩余测试资金，最多 0.2236 USDC；审批和充值各最多 0.005 USDC gas。付款预算签名不包含这两笔交易。</p>
    {notice && <p className="tool-notice" role="status" aria-live="polite">{notice}</p>}
    <button disabled={disabled || busy} onClick={() => void run(review)}>{busy ? "处理中，请查看下方提示…" : "核对剩余缺口及链上报价"}</button>
    {quote && <><p>金额：<b>{quote.amount_usdc} USDC</b>；下一步：{quote.approval_needed ? "精确代币授权（钱包额度必须与此金额一致）" : "存入自己的 Gateway 余额"}；报价 60 秒有效。</p>
    <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>我同意此精确充值额和每笔最多 0.005 USDC gas。</label>
    <p><button disabled={disabled || busy || !consent} onClick={() => void run(send)}>{quote.approval_needed ? "钱包确认精确授权" : "钱包确认 Gateway 充值"}</button></p></>}
    <details open={!!saved}><summary>核对原充值交易（不会重新发送）</summary>
      {saved && <p>本机记录：{saved.kind} · {saved.state}。{saved.hash && <a href={`${arc.explorerUrl}/tx/${saved.hash}`} target="_blank" rel="noreferrer">查看已保存的原交易</a>}</p>}
      <label>原授权／充值交易哈希（留空使用本机记录）<input placeholder="原交易 0x 哈希，不是清零交易" value={recoveryHash} onChange={e => setRecoveryHash(e.target.value)}/></label>
      {saved?.kind === "approve" && <label>已清零时填写撤销交易哈希<input placeholder="后续 approve(0) 的 0x 哈希；未撤销则留空" value={revokeHash} onChange={e => setRevokeHash(e.target.value)}/></label>}
      <button disabled={disabled || busy} onClick={() => void run(recover)}>{busy ? "只读核查中…" : "只读核对原交易及撤销"}</button>
    </details>
    <p><a href="/pilot">检查或清零 Gateway 代币授权</a></p>
  </section>;
}

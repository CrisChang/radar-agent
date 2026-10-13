"use client";
import { useState } from "react";
import { createPublicClient, http, encodeFunctionData, type WalletClient, type Transport, type Chain, type Account } from "viem";
import { erc20Abi } from "viem";
import type { ArcConfig } from "@/lib/arc";
import { assertFundingQuote, assertFundingTransaction, gatewayDepositAbi, type FundingQuote } from "@/lib/gateway-funding";
import { walletRejected } from "@/lib/wallet-rejection";
import { CAMPAIGN_ID } from "@/lib/validation-plan";

export default function CampaignFunding({ arc, payer, account, disabled, onMessage }: {
  arc: ArcConfig; payer: string; account: () => Promise<WalletClient<Transport, Chain, Account>>; disabled: boolean; onMessage: (s: string) => void;
}) {
  const [quote, setQuote] = useState<FundingQuote>(), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false), [recoveryHash, setRecoveryHash] = useState("");
  const key = `radar:validation-funding:${CAMPAIGN_ID}:${payer.toLowerCase()}`;
  async function run(action: () => Promise<void>) {
    if (busy || disabled) return; setBusy(true);
    try { await action(); } catch (e) { onMessage(e instanceof Error && /^(Funding|Gateway|Reconcile|No top-up|Wallet|已有|请|充值|报价)/.test(e.message) ? e.message.slice(0, 260) : "充值结果未明，请检查钱包交易记录并使用哈希核对，不要重新发送。"); }
    finally { setBusy(false); }
  }
  async function review() {
    await account();
    const previous = JSON.parse(localStorage.getItem(key) ?? "null");
    if (previous && previous.state !== "approval_confirmed") throw new Error("已有充值操作记录，请先通过原交易哈希核对，不能重新发送。");
    const response = await fetch("/api/validation/funding", { cache: "no-store", redirect: "error" });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Funding quote unavailable");
    if (!/^[1-9]\d*$/.test(body.amount_atomic) || BigInt(body.amount_atomic) > 223_600n) throw new Error("Funding quote exceeds the 0.2236 USDC maximum");
    assertFundingQuote(body, arc, payer, Date.now(), BigInt(body.amount_atomic)); setQuote(body); setConsent(false);
    onMessage(`充值报价：${body.amount_usdc} USDC，只补足本轮余额缺口。每笔链上交易 gas 最多 0.005 USDC。`);
  }
  async function reconcile(kind: "approve" | "deposit", hash: `0x${string}`, amount: bigint) {
    const client = createPublicClient({ transport: http(arc.rpcUrl, { timeout: 10_000, retryCount: 0 }) });
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 3, timeout: 90_000 });
    const tx = await client.getTransaction({ hash });
    assertFundingTransaction(kind, arc, payer, tx, receipt, amount);
    const allowance = await client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "allowance", args: [payer as `0x${string}`, arc.gatewayWallet] });
    if (allowance !== (kind === "approve" ? amount : 0n)) throw new Error("Gateway allowance differs from the exact approved amount. Revoke excess via the wallet tools before continuing");
    localStorage.setItem(key, JSON.stringify({ kind, hash, amount: amount.toString(), state: kind === "approve" ? "approval_confirmed" : "deposit_confirmed" }));
    setQuote(undefined); setConsent(false);
    onMessage(kind === "approve" ? "精确授权已核实。重新获取充值报价，再确认 deposit 交易。" : "充值交易和授权归零已核实。等待 Gateway 余额入账后，再批准下一阶段。不要重复充值。");
  }
  async function send() {
    if (!quote || !consent) throw new Error("请先核对报价和充值预算。");
    const client = await account(), amount = BigInt(quote.amount_atomic);
    assertFundingQuote(quote, arc, payer, Date.now(), amount);
    const previous = JSON.parse(localStorage.getItem(key) ?? "null");
    if (previous && previous.state !== "approval_confirmed") throw new Error("已有未核对或完成的充值记录，不能重复发起。");
    const kind = quote.approval_needed ? "approve" : "deposit";
    localStorage.setItem(key, JSON.stringify({ kind, amount: amount.toString(), state: "signing_or_unknown" }));
    let hash: `0x${string}`;
    try {
      hash = await client.sendTransaction({ account: client.account, chain: client.chain,
        to: kind === "approve" ? arc.usdc : arc.gatewayWallet, value: 0n,
        data: kind === "approve" ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, amount] })
          : encodeFunctionData({ abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, amount] }),
        gas: BigInt(kind === "approve" ? quote.approval_gas_limit : quote.deposit_gas_limit), gasPrice: BigInt(quote.gas_price_wei) });
    } catch (e) {
      if (walletRejected(e)) { if (previous) localStorage.setItem(key, JSON.stringify(previous)); else localStorage.removeItem(key); }
      throw e;
    }
    localStorage.setItem(key, JSON.stringify({ kind, amount: amount.toString(), hash, state: "submitted" }));
    onMessage(`已提交 ${kind}，正在核对原交易：${hash}`); await reconcile(kind, hash, amount);
  }
  async function recover() {
    await account(); const previous = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!previous || !["approve", "deposit"].includes(previous.kind)) throw new Error("请先检查本机充值记录。");
    const hash = recoveryHash.trim() || previous.hash;
    if (!/^0x[\da-f]{64}$/i.test(hash ?? "")) throw new Error("请从钱包复制原充值相关交易哈希。");
    await reconcile(previous.kind, hash, BigInt(previous.amount));
  }
  return <section className="validation-funding"><h3>后续阶段充值 / Optional funding</h3>
    <p>先使用现有余额完成并核查 10 笔。后续仅补足剩余测试资金，最多 0.2236 USDC；审批和充值各最多 0.005 USDC gas。付款预算签名不包含这两笔交易。</p>
    <button disabled={disabled || busy} onClick={() => void run(review)}>核对剩余缺口及链上报价</button>
    {quote && <><p>金额：<b>{quote.amount_usdc} USDC</b>；下一步：{quote.approval_needed ? "精确代币授权" : "存入自己的 Gateway 余额"}；报价 60 秒有效。</p>
    <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>我同意此精确充值额和每笔最多 0.005 USDC gas。</label>
    <p><button disabled={disabled || busy || !consent} onClick={() => void run(send)}>{quote.approval_needed ? "钱包确认精确授权" : "钱包确认 Gateway 充值"}</button></p></>}
    <details><summary>核对原充值交易（不会重新发送）</summary><input placeholder="原交易 0x 哈希，可留空使用本机记录" value={recoveryHash} onChange={e => setRecoveryHash(e.target.value)}/><button disabled={disabled || busy} onClick={() => void run(recover)}>只读核对原交易</button></details>
    <p><a href="/pilot">检查或清零 Gateway 代币授权</a></p>
  </section>;
}

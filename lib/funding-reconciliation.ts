import { decodeFunctionData, erc20Abi } from "viem";
import type { ArcConfig } from "./arc";
import { assertFundingTransaction } from "./gateway-funding";

export interface FundingFacts {
  hash: `0x${string}`;
  tx: { from: string; to: string | null; value: bigint; input: `0x${string}`; blockHash: string | null };
  receipt: { status: string; gasUsed: bigint; effectiveGasPrice: bigint; blockNumber: bigint; blockHash: string };
}
export function assertCanonicalFundingFacts(facts: FundingFacts, head: bigint, blockHash: string | null) {
  if (facts.receipt.status !== "success" || facts.tx.blockHash !== facts.receipt.blockHash ||
      facts.receipt.blockHash !== blockHash || head < facts.receipt.blockNumber + 2n) throw new Error("Funding transaction is not canonically confirmed");
}
export function fundingResult(arc: ArcConfig, payer: string, kind: "approve" | "deposit", amount: bigint,
  original: FundingFacts, allowance: bigint, revoke?: FundingFacts) {
  if (arc.mode !== "mainnet" || amount <= 0n || amount > 223_600n) throw new Error("Invalid funding scope");
  const base = { wallet: payer, chain_id: 5042, kind, original_hash: original.hash, amount_atomic: amount.toString(), allowance_atomic: allowance.toString(), transaction_attempted: false };
  if (kind === "deposit") {
    if (revoke) throw new Error("A deposit cannot be reset using an approval revocation");
    assertFundingTransaction(kind, arc, payer, original.tx, original.receipt, amount);
    if (allowance !== 0n) throw new Error("Allowance is not zero after the deposit");
    return { ...base, status: "deposit_confirmed" as const };
  }
  const call = decodeFunctionData({ abi: erc20Abi, data: original.tx.input });
  if (call.functionName !== "approve") throw new Error("Original transaction is not an approval");
  const actual = (call.args as readonly [string, bigint])[1];
  // An edited amount can be diagnosed, but is never accepted as the intended approval.
  assertFundingTransaction("approve", arc, payer, original.tx, original.receipt, actual);
  if (revoke) {
    assertFundingTransaction("revoke", arc, payer, revoke.tx, revoke.receipt);
    if (revoke.hash === original.hash || revoke.receipt.blockNumber <= original.receipt.blockNumber || allowance !== 0n) throw new Error("A later confirmed zero-allowance transaction is required");
    return { ...base, status: "approval_revoked" as const, actual_approval_atomic: actual.toString(), revoke_hash: revoke.hash };
  }
  if (actual !== amount || allowance !== amount) return { ...base, status: "approval_requires_review" as const, actual_approval_atomic: actual.toString() };
  return { ...base, status: "approval_confirmed" as const, actual_approval_atomic: actual.toString() };
}
export type FundingResult = ReturnType<typeof fundingResult>;
export interface FundingJournal {
  kind: "approve" | "deposit"; amount: string; state: string; hash?: `0x${string}`;
  proof?: FundingResult; history?: FundingJournal[];
}
export function reconcileFundingJournal(saved: FundingJournal, result: FundingResult, payer: string, hash: string, revokeHash?: string): FundingJournal {
  if (result.transaction_attempted !== false || result.chain_id !== 5042 || result.wallet.toLowerCase() !== payer.toLowerCase() ||
      result.kind !== saved.kind || result.original_hash.toLowerCase() !== hash.toLowerCase() ||
      saved.hash && saved.hash.toLowerCase() !== hash.toLowerCase() || result.amount_atomic !== saved.amount) throw new Error("Funding reconciliation scope changed");
  if (result.status === "approval_revoked" && (saved.kind !== "approve" || !revokeHash || result.revoke_hash?.toLowerCase() !== revokeHash.toLowerCase() || result.allowance_atomic !== "0")) throw new Error("Missing revocation proof");
  if (result.status === "deposit_confirmed" && saved.kind !== "deposit" || result.status !== "deposit_confirmed" && saved.kind === "deposit") throw new Error("Funding kind changed");
  if (!["approval_confirmed", "deposit_confirmed", "approval_requires_review", "approval_revoked"].includes(result.status)) throw new Error("Unknown funding result");
  return { ...saved, hash: hash as `0x${string}`, state: result.status, proof: result };
}
export function nextFundingJournal(saved: FundingJournal | null, kind: "approve" | "deposit", amount: bigint): FundingJournal {
  if (amount <= 0n || amount > 223_600n) throw new Error("Funding amount exceeds the fixed campaign cap");
  if (saved && !["approval_confirmed", "approval_revoked"].includes(saved.state)) throw new Error("已有充值操作记录，请先通过原交易哈希核对，不能重复发送。");
  if (kind === "deposit" && saved?.state === "approval_revoked") throw new Error("请先重新获取报价并完成精确授权。");
  let history: FundingJournal[] = [];
  if (saved) { const { history: previousHistory, ...previous } = saved; history = [...(previousHistory ?? []), previous]; }
  return { kind, amount: amount.toString(), state: "signing_or_unknown", history };
}

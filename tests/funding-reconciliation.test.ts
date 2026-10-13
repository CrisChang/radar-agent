import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, erc20Abi } from "viem";
import { NextRequest } from "next/server";
import { getArcConfig } from "../lib/arc";
import { gatewayDepositAbi } from "../lib/gateway-funding";
import { assertCanonicalFundingFacts, fundingResult, nextFundingJournal, reconcileFundingJournal, type FundingFacts, type FundingJournal } from "../lib/funding-reconciliation";
import { validationFundingReconcile } from "../lib/validation-funding-reconcile";
const arc = getArcConfig({ ARC_NETWORK: "mainnet" }), payer = "0x2222222222222222222222222222222222222222", amount = 223_600n;
const hash = `0x${"ab".repeat(32)}` as const, revokeHash = `0x${"cd".repeat(32)}` as const;
function facts(kind: "approve" | "deposit", value = amount, block = 100n, txHash: `0x${string}` = hash): FundingFacts {
  const blockHash = `0x${block.toString(16).padStart(64,"0")}`;
  return { hash: txHash, tx: { from: payer, to: kind === "approve" ? arc.usdc : arc.gatewayWallet, value: 0n, blockHash,
    input: kind === "approve" ? encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet,value] })
      : encodeFunctionData({ abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc,value] }) },
    receipt: { status: "success", gasUsed: 50_000n, effectiveGasPrice: 20_000_000_000n, blockNumber: block, blockHash } };
}
test("exact approval and deposit reconcile without any transaction submission", () => {
  assert.equal(fundingResult(arc,payer,"approve",amount,facts("approve"),amount).status,"approval_confirmed");
  assert.equal(fundingResult(arc,payer,"deposit",amount,facts("deposit"),0n).status,"deposit_confirmed");
  assert.equal(fundingResult(arc,payer,"deposit",amount,facts("deposit"),0n).transaction_attempted,false);
  assert.throws(()=>fundingResult(arc,payer,"deposit",amount,facts("deposit",amount+1n),0n));
  assert.throws(()=>fundingResult(arc,payer,"deposit",amount,facts("deposit"),1n));
});
test("edited large allowance remains blocked until a later confirmed zero approval", () => {
  const edited = facts("approve",507_113_523_680_905n), revoked = facts("approve",0n,110n,revokeHash);
  const blocked = fundingResult(arc,payer,"approve",amount,edited,507_113_523_680_905n);
  assert.equal(blocked.status,"approval_requires_review");
  assert.equal(fundingResult(arc,payer,"approve",amount,edited,0n).status,"approval_requires_review");
  const ready = fundingResult(arc,payer,"approve",amount,edited,0n,revoked);
  assert.equal(ready.status,"approval_revoked"); assert.equal(ready.revoke_hash,revokeHash);
  assert.equal(ready.actual_approval_atomic,"507113523680905"); assert.equal(ready.transaction_attempted,false);
});
test("a zero allowance alone, earlier revoke, wrong scope or deposit cannot unlock an approval", () => {
  for (const mode of ["earlier","same_block","same_hash","nonzero_revoke","nonzero_current","wrong_owner","wrong_target","failed","gas","deposit"] as const) {
    const original = facts(mode === "deposit" ? "deposit" : "approve",amount+1n);
    const revoke = facts("approve",0n,110n,revokeHash); let allowance=0n;
    if (mode === "earlier") revoke.receipt.blockNumber=99n;
    if (mode === "same_block") revoke.receipt.blockNumber=100n;
    if (mode === "same_hash") revoke.hash=hash;
    if (mode === "nonzero_revoke") revoke.tx.input=facts("approve",1n).tx.input;
    if (mode === "nonzero_current") allowance=1n;
    if (mode === "wrong_owner") revoke.tx.from=arc.gatewayWallet;
    if (mode === "wrong_target") revoke.tx.to=arc.gatewayWallet;
    if (mode === "failed") revoke.receipt.status="reverted";
    if (mode === "gas") revoke.receipt.gasUsed=1_000_000n;
    assert.throws(()=>fundingResult(arc,payer,mode === "deposit" ? "deposit" : "approve",amount,original,allowance,revoke),mode);
  }
});
test("canonical block identity and three confirmations are required", () => {
  const f=facts("approve"); assertCanonicalFundingFacts(f,102n,f.receipt.blockHash);
  assert.throws(()=>assertCanonicalFundingFacts(f,101n,f.receipt.blockHash));
  assert.throws(()=>assertCanonicalFundingFacts(f,102n,revokeHash));
  f.tx.blockHash=null; assert.throws(()=>assertCanonicalFundingFacts(f,102n,f.receipt.blockHash));
});
test("recovered journal retains original history and never enables repeat deposit", () => {
  const old: FundingJournal={kind:"approve",hash,amount:amount.toString(),state:"submitted"};
  const proof=fundingResult(arc,payer,"approve",amount,facts("approve",amount+1n),0n,facts("approve",0n,110n,revokeHash));
  const recovered=reconcileFundingJournal(old,proof,payer,hash,revokeHash);
  assert.equal(recovered.hash,hash); assert.equal(recovered.state,"approval_revoked");
  const pending=nextFundingJournal(recovered,"approve",amount);
  assert.deepEqual(pending.history,[recovered]); assert.equal(pending.state,"signing_or_unknown");
  assert.throws(()=>nextFundingJournal(recovered,"deposit",amount));
  for(const state of ["submitted","signing_or_unknown","approval_requires_review","deposit_confirmed"]) assert.throws(()=>nextFundingJournal({...old,state},"approve",amount));
  assert.throws(()=>nextFundingJournal(null,"approve",223_601n));
  assert.throws(()=>reconcileFundingJournal(old,proof,payer,hash));
  assert.throws(()=>reconcileFundingJournal(old,{...proof,amount_atomic:"1"},payer,hash,revokeHash));
  assert.throws(()=>reconcileFundingJournal(old,{...proof,original_hash:revokeHash},payer,hash,revokeHash));
  assert.throws(()=>reconcileFundingJournal({...old,kind:"deposit"},proof,payer,hash,revokeHash));
});
test("reconciliation route rejects invalid requests before making any RPC request", async () => {
  const original=globalThis.fetch; let reads=0;
  globalThis.fetch=async()=>{reads++; throw new Error("Should not call network");};
  try {
    for(const query of ["",`hash=${hash}&kind=approve&amount_atomic=223601`,`hash=${hash}&kind=deposit&amount_atomic=1&revoke_hash=bad`,`hash=${hash}&kind=send&amount_atomic=1`]) {
      const response=await validationFundingReconcile(new NextRequest(`https://radar.example/api/validation/funding-reconcile?${query}`));
      assert.equal(response.status,409); assert.equal((await response.json()).transaction_attempted,false);
    }
    assert.equal(reads,0);
  } finally {globalThis.fetch=original;}
});

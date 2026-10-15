export interface FundingRow {wallet_transaction_nonce:number;hash:string;kind:string;scope:string;amount_atomic:string|null;gas_atomic_18:string}
const native=(s:string)=>/^(0|[1-9]\d*)$/.test(s);
export function fundingCostSummary(rows:FundingRow[],walletDebitAtomic18:string){
 if(!rows.length||!native(walletDebitAtomic18)||new Set(rows.map(r=>r.hash)).size!==rows.length)throw Error("Invalid funding ledger");
 let gas=0n,deposits=0n,campaignGas=0n,bootstrapGas=0n,recoveryGas=0n;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(r.wallet_transaction_nonce!==i||!/^0x[0-9a-f]{64}$/i.test(r.hash)||!native(r.gas_atomic_18)||!["campaign_incremental","shared_bootstrap_and_pilot"].includes(r.scope)||!["approval","over_limit_approval","deposit","revoke"].includes(r.kind))throw Error("Incomplete funding transaction sequence");
  const fee=BigInt(r.gas_atomic_18);gas+=fee;if(r.scope==="campaign_incremental")campaignGas+=fee;else bootstrapGas+=fee;
  if(r.kind==="deposit"){if(!r.amount_atomic||!native(r.amount_atomic))throw Error("Invalid deposit amount");deposits+=BigInt(r.amount_atomic);}
  if(r.kind==="over_limit_approval"||r.kind==="revoke")recoveryGas+=fee;
 }
 const expected=deposits*10n**12n+gas,difference=BigInt(walletDebitAtomic18)-expected;if(difference!==0n)throw Error("Wallet movement does not reconcile");
 return {deposit_atomic:deposits.toString(),total_gas_atomic_18:gas.toString(),campaign_gas_atomic_18:campaignGas.toString(),shared_bootstrap_gas_atomic_18:bootstrapGas.toString(),approval_correction_gas_atomic_18:recoveryGas.toString(),expected_wallet_debit_atomic_18:expected.toString(),wallet_difference_atomic_18:difference.toString()};
}

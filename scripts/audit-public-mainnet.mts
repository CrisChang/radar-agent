/** Read-only audit. No signer, payment submit, Redis mutation or report publish. */
import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CampaignEvent } from '../lib/validation-store';
import { paymentIdentity, type PaymentRecord } from '../lib/payment-store';
import { searchAllTransfers, matchTransfer, verifyBatch, scenarioEvidence } from '../lib/validation-reconcile';
import { PAYMENT_SCHEDULE, SCHEDULE_SHA256, CAMPAIGN_ID, intentRequestId, formatAtomic } from '../lib/validation-plan';
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from '../lib/arc';
import { inspectCampaignPayment } from '../lib/validation-authorization';
import { readPrivateJson } from '../lib/validation-local-files';
import type { PrivateJournal } from '../lib/validation-runner';
const require = createRequire(import.meta.url), createProxyAgent = require('https-proxy-agent');
process.env.ARC_NETWORK='mainnet';
process.env.PILOT_BUYER_ADDRESS='0xefc70a0dedefee6a010bac44de489bafb2fd8422';
process.env.SELLER_ADDRESS='0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C';
const root=process.env.RADAR_AUDIT_JOURNAL_ROOT ?? join(homedir(),'.radar-agent-local','9fa4c2fc-00ee-44c9-ae62-c309424b69fe');
const origin='https://radar-agent-ivory.vercel.app', arc=getArcConfig(), rpc=new URL(arc.rpcUrl);
let phase='public reconciliation';
const receipts=new Map<string,any>();let reads=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url),method=init?.method??'GET';
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('scope');
 if(url.origin===rpc.origin){
  const body=JSON.parse(String(init?.body));
  const allowed=['eth_chainId','eth_getTransactionReceipt','eth_getTransactionByHash','eth_blockNumber','eth_getBlockByNumber'];
  if(method!=='POST'||!allowed.includes(body.method))throw Error('RPC mutation blocked');
 }else if(url.origin==='https://gateway-api.circle.com'){
  if(method!=='GET'||url.pathname!=='/v1/x402/transfers')throw Error('Gateway mutation blocked');
 }else if(url.origin===origin){if(method!=='GET'||url.pathname!=='/api/validation/status'||init?.body)throw Error('public status scope');}else throw Error('network scope');
 reads++;
 const response=await new Promise<Response>((resolve,reject)=>{
  const req=request(url,{method,headers:Object.fromEntries(new Headers(init?.headers)),signal:init?.signal??AbortSignal.timeout(20000),
   agent:createProxyAgent('http://127.0.0.1:7897')},res=>{
   const chunks:Buffer[]=[];let size=0;res.on('data',c=>{size+=c.length;if(size>16777216)req.destroy(Error('response limit'));else chunks.push(c);});
   res.on('error',reject);res.on('end',()=>{
    const h=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)h.append(res.rawHeaders[i],res.rawHeaders[i+1]);
    resolve(new Response(Buffer.concat(chunks),{status:res.statusCode??502,headers:h}));
   });
  });req.on('error',reject);req.end(init?.body as string|undefined);
 });
 if(response.status>=300&&response.status<400)throw Error('redirect blocked');
 if(url.origin===rpc.origin){
  const body=JSON.parse(String(init?.body));if(body.method==='eth_getTransactionReceipt'){
   const result=await response.clone().json();if(result.result)receipts.set(String(body.params[0]).toLowerCase(),result.result);
  }
 }
 return response;
};
function distribution(values:number[]){
 const sorted=values.filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
 const q=(p:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]:null;
 return {samples:sorted.length,p50_ms:q(.5),p95_ms:q(.95),p99_ms:q(.99),max_ms:sorted.at(-1)??null};
}
async function readPublicStatus(){const response=await fetch(`${origin}/api/validation/status`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('status');return response.json() as Promise<any>;}
async function main(){
 const source=await readPublicStatus(),report=source.report,rows=report?.rows;
 if(source.state?.reservedCount!==1000||report?.completed_payments!==1000||report.money_difference_atomic!=="0"||!Array.isArray(rows)||rows.length!==1000)throw Error("incomplete public reconciliation");
 const seen=new Set<string>();let expected=0n;
 for(const plan of PAYMENT_SCHEDULE){
  const matches=rows.filter((r:any)=>r.intent===plan.planned_intent_id);if(matches.length!==1)throw Error("duplicate public row");
  const row=matches[0],body=JSON.stringify({campaign_id:CAMPAIGN_ID,intent:plan.planned_intent_id,purpose:"owner_controlled_payment_reliability_test",amount_atomic:plan.amount_atomic,scenario:plan.scenario});
  if(row.amount_atomic!==plan.amount_atomic||row.scenario!==plan.scenario||row.stage!==plan.stage||row.transfer_status!=="completed"||row.proof!=="provider_attribution_and_chain_aggregate_verified"||row.response_sha256!==createHash("sha256").update(body).digest("hex"))throw Error("plan or response digest mismatch");
  expected+=BigInt(plan.amount_atomic);seen.add(row.intent);
 }
 phase="provider transfer history";const transfers=await searchAllTransfers();
 const hashes=[...new Set<string>(rows.map((r:any)=>r.batch_hash))];
 if(hashes.length!==32||hashes.some(h=>!/^0x[0-9a-f]{64}$/i.test(h)))throw Error("batch scope");
 const campaignTransfers=transfers.filter(t=>t.status==="completed"&&hashes.some(h=>h.toLowerCase()===t.txHash?.toLowerCase())&&t.fromAddress.toLowerCase()===getPilotBuyerAddress().toLowerCase()&&t.toAddress.toLowerCase()===getSellerAddress().toLowerCase()&&t.sendingNetwork===arc.network&&t.recipientNetwork===arc.network);
 if(campaignTransfers.length!==1000||new Set(campaignTransfers.map(t=>t.nonce.toLowerCase())).size!==1000)throw Error("provider count or duplicate nonce");
 const group=(hash:string,amount:string)=>`${hash.toLowerCase()}:${amount}`;
 const providerGroups=new Map<string,number>(),reportGroups=new Map<string,number>();
 for(const t of campaignTransfers){const k=group(t.txHash!,t.amount);providerGroups.set(k,(providerGroups.get(k)??0)+1);}
 for(const row of rows){const k=group(row.batch_hash,row.amount_atomic);reportGroups.set(k,(reportGroups.get(k)??0)+1);}
 if(providerGroups.size!==reportGroups.size||[...providerGroups].some(([k,n])=>reportGroups.get(k)!==n))throw Error("amount/batch groups differ");
 let localCount=0;const localNonces=new Set<string>();
 for(const plan of PAYMENT_SCHEDULE.filter(p=>p.stage===3)){
  const local=await readPrivateJson<PrivateJournal>(join(root,`${plan.planned_intent_id}.json`));
  if(!local?.paymentHeader||local.state!=="accepted"||local.requestId!==intentRequestId(plan))throw Error("local record missing");
  const a=inspectCampaignPayment(local.paymentHeader,plan,{arc,origin,payer:getPilotBuyerAddress(),seller:getSellerAddress()}).payload.authorization;
  const matches=campaignTransfers.filter(t=>t.nonce.toLowerCase()===a.nonce.toLowerCase());
  const row=rows.find((r:any)=>r.intent===plan.planned_intent_id);
  if(matches.length!==1||matches[0].amount!==plan.amount_atomic||matches[0].txHash?.toLowerCase()!==row.batch_hash.toLowerCase()||local.responseHash!==row.response_sha256||localNonces.has(a.nonce.toLowerCase()))throw Error("local/provider receipt mismatch");
  localNonces.add(a.nonce.toLowerCase());localCount++;
 }
 console.log(`1,000 public rows and transfer amount/batch groups matched; ${localCount} original local authorizations matched individually.`);
 phase="independent Arc batches";const batches=[];
 for(let i=0;i<hashes.length;i+=4){
  const part=await Promise.all(hashes.slice(i,i+4).map(async hash=>{
   let error:unknown;for(let n=0;n<2;n++){try{return await verifyBatch(hash as `0x${string}`,transfers);}catch(e){error=e;}}
   throw error;
  }));batches.push(...part);console.log(`Verified ${batches.length}/${hashes.length} Arc batches.`);
 }
 if(batches.some(b=>!b.passed))throw Error("batch difference");
 const actual=campaignTransfers.reduce((n,t)=>n+BigInt(t.amount),0n);if(actual!==expected)throw Error("principal difference");
 const batchEvidence=batches.map(b=>{const receipt=receipts.get(b.hash.toLowerCase());if(!receipt?.gasUsed||!receipt.effectiveGasPrice)throw Error("gas receipt missing");return {...b,gas_used:BigInt(receipt.gasUsed).toString(),effective_gas_price_atomic:BigInt(receipt.effectiveGasPrice).toString(),network_gas_atomic_18:(BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice)).toString(),gas_payer:receipt.from};});
 const pairCompleted=transfers.filter(t=>t.status==="completed"&&t.fromAddress.toLowerCase()===getPilotBuyerAddress().toLowerCase()&&t.toAddress.toLowerCase()===getSellerAddress().toLowerCase());
 const duplicateCompleted=pairCompleted.length-new Set(pairCompleted.map(t=>t.nonce.toLowerCase())).size;
 const audit={schema:"radar-mainnet-audit-v1",mode:"public_report_plus_local_authorizations",campaign_id:CAMPAIGN_ID,schedule_sha256:SCHEDULE_SHA256,checked_at:new Date().toISOString(),
  scope:"All 1,000 public saved-report rows and provider amount/batch groups checked; 900 local authorizations individually matched. Private server receipt/event exports have not yet been inspected.",
  checks:{public_report_rows:1000,server_receipts_compared:0,provider_transfers_matched:1000,provider_group_matched_browser_rows:100,individual_nonce_matches:localCount,local_journals_compared:localCount,unique_response_hashes:new Set(rows.map((r:any)=>r.response_sha256)).size,
   independent_batches_verified:batches.length,expected_payment_atomic:expected.toString(),actual_payment_atomic:actual.toString(),payment_difference_atomic:(actual-expected).toString(),max_batch_wallet_difference_atomic:"0",duplicate_provider_charges:duplicateCompleted,
   all_payment_checks_passed:actual===expected&&batches.every(b=>b.passed)&&duplicateCompleted===0,scenario_passes:report.scenario_verified_payments,scenario_target:1000,private_export_audit_complete:false},
  request_overhead:{server_attempts:report.http_attempts,extra_attempts_above_unique_payments:report.http_attempts-1000,supplemental_receipt_only_attempts:rows.reduce((n:number,r:any)=>n+(r.supplemental_replay_attempts??0),0),
   handler_interval:{samples:0,p50_ms:null,p95_ms:null,p99_ms:null,max_ms:null},settlement_and_receipt_save_interval:{samples:0,p50_ms:null,p95_ms:null,p99_ms:null,max_ms:null},timing_scope:"No original server event export inspected yet. Per-phase latency is not inferred from report counts."},
  costs:{payment_principal_usdc:formatAtomic(actual),unexpected_principal_loss_usdc:formatAtomic(actual-expected),observed_shared_batch_gas_atomic_18:batchEvidence.reduce((n,b)=>n+BigInt(b.network_gas_atomic_18),0n).toString(),
   gas_scope:"Network gas of shared batches paid by submitters; not allocated to this campaign or each caller.",campaign_funding_gas_usdc:null,per_request_gas_usdc:null,provider_fee_usdc:null,total_caller_cost_usdc:null},
  amount_tiers:[...new Set<string>(rows.map((r:any)=>r.amount_atomic))].sort((a,b)=>Number(a)-Number(b)).map(amount=>({amount_atomic:amount,amount_usdc:formatAtomic(amount),planned:100,completed:rows.filter((r:any)=>r.amount_atomic===amount).length,total_atomic:(BigInt(amount)*100n).toString(),difference_atomic:"0"})),
  scenarios:[...new Set<string>(rows.map((r:any)=>r.scenario))].map(s=>({scenario:s,planned:rows.filter((r:any)=>r.scenario===s).length,scenario_passed:rows.filter((r:any)=>r.scenario===s&&r.scenario_passed===true).length,pending:rows.filter((r:any)=>r.scenario===s&&r.scenario_passed!==true).map((r:any)=>r.intent)})),
  limitations:["The first 100 browser rows were compared by batch/amount group and published server attribution, not independently by their private nonce values.","900 local authorizations and hashes were matched individually to provider transfers.","Private server receipt and state-event exports are still needed for the additional full record/event audit.","Per-payment attribution relies on Gateway; Arc independently checks aggregate batch deltas.","Owner-controlled tests; no customer revenue. Settled-receipt supplements do not establish initial-settlement races. Accelerated schedule disclosed.","Funding, provider and infrastructure costs are unmeasured; unknown is not zero."],
  rows:rows.map((r:any)=>({intent:r.intent,stage:r.stage,scenario:r.scenario,amount_atomic:r.amount_atomic,amount_usdc:r.amount_usdc,transfer_status:r.transfer_status,batch_hash:r.batch_hash,response_sha256:r.response_sha256,local_journal_compared:r.stage===3})),batches:batchEvidence};
 await writeFile("data/mainnet-audit.json",JSON.stringify(audit,null,2)+"\n");await writeFile("data/mainnet-report.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({passed:audit.checks.all_payment_checks_passed,expected_atomic:expected.toString(),actual_atomic:actual.toString(),local_authorizations:localCount,batches:batches.length,private_export_audit_complete:false}));
}
main().catch(()=>{console.error(`Public/local read-only audit stopped at ${phase}; no new payment or remote mutation was attempted.`);process.exitCode=1;});

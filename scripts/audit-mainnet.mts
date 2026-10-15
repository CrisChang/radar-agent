import fundingCosts from '../data/mainnet-funding-costs.json';
import { mergeEventExport } from '../lib/mainnet-audit-tail';
import { auditEventLedger } from '../lib/mainnet-audit-events';
import { auditRecords } from '../lib/mainnet-audit-input';
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
let phase='private receipt export';
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
 if(arc.chainId!==5042)throw Error('mainnet only');
 const receiptFile=process.argv.includes('--receipts')?process.argv[process.argv.indexOf('--receipts')+1]:join(homedir(),'Downloads',`${CAMPAIGN_ID}-receipts-private.json`);
 const eventFile=process.argv.includes('--events')?process.argv[process.argv.indexOf('--events')+1]:join(homedir(),'Downloads',`${CAMPAIGN_ID}-events-private.json`);
 const exported=JSON.parse(await readFile(receiptFile,'utf8'));let eventExport=JSON.parse(await readFile(eventFile,'utf8'));
 if(process.argv.includes('--events-tail'))eventExport=mergeEventExport(eventExport,JSON.parse(await readFile(process.argv[process.argv.indexOf('--events-tail')+1],'utf8')));
 const parsed=auditRecords(exported,eventExport,arc,getPilotBuyerAddress(),getSellerAddress());
 const source=await readPublicStatus();
 const recordsFromExport=parsed.records;
 const store={state:async()=>source.state,allRecords:async()=>recordsFromExport,events:async(offset:number,limit:number)=>parsed.events.slice(offset,offset+limit),report:async()=>source.report};
 const state=await store.state();if(state?.reservedCount!==1000)throw Error('campaign incomplete');
 const records:PaymentRecord[]=await store.allRecords();if(records.length!==1000)throw Error('missing receipts');
 console.log('Read all 1,000 server receipts; fetching provider attribution.');
 phase='Gateway attribution';
 const transfers=await searchAllTransfers(),matched=records.map(record=>({record,transfer:matchTransfer(record,transfers)}));
 const ids=new Set<string>(),nonces=new Set<string>(),responseHashes=new Set<string>();
 let expected=0n,actual=0n,localCount=0;
 const discrepancies:string[]=[];
 const rows: {intent:string;stage:number;scenario:string;amount_atomic:string;amount_usdc:string;transfer_status:string;batch_hash:string|undefined;response_sha256:string;local_journal_compared:boolean;server_record_created_at:string|null;server_record_updated_at:string|null}[]=[];
 for(const plan of PAYMENT_SCHEDULE){
  const item=matched.find(x=>x.record.campaign?.intent===plan.planned_intent_id);if(!item?.transfer)throw Error('missing transfer');
  const {record,transfer}=item;
  if(record.state!=='accepted'||record.requestId!==intentRequestId(plan)||record.terms?.amountAtomic!==plan.amount_atomic||
   record.terms?.payTo.toLowerCase()!==getSellerAddress().toLowerCase()||record.terms?.asset.toLowerCase()!==arc.usdc.toLowerCase()||
   record.authorization?.payer!==getPilotBuyerAddress().toLowerCase()||record.authorization.network!==arc.network||transfer.status!=='completed'||!record.response)throw Error('receipt scope');
  if(ids.has(transfer.id)||nonces.has(transfer.nonce.toLowerCase()))throw Error('duplicate transfer');ids.add(transfer.id);nonces.add(transfer.nonce.toLowerCase());
  const hash=createHash('sha256').update(record.response.body).digest('hex'),body=JSON.parse(record.response.body);
  if(hash!==record.response.headers['x-radar-response-sha256']||body.campaign_id!==CAMPAIGN_ID||body.intent!==plan.planned_intent_id||body.amount_atomic!==plan.amount_atomic||body.scenario!==plan.scenario)throw Error('response mismatch');
  responseHashes.add(hash);expected+=BigInt(plan.amount_atomic);actual+=BigInt(transfer.amount);
  const local=await readPrivateJson<PrivateJournal>(join(root,`${plan.planned_intent_id}.json`));
  if(local){
   const a=inspectCampaignPayment(local.paymentHeader!,plan,{arc,origin,payer:getPilotBuyerAddress(),seller:getSellerAddress()}).payload.authorization;
   const identity=paymentIdentity(JSON.parse(Buffer.from(local.paymentHeader!,'base64').toString('utf8')),arc.network,arc.gatewayWallet,local.requestId,`GET:/api/validation/payment?intent=${plan.planned_intent_id}`);
   if(identity.fingerprint!==record.fingerprint)throw Error('local authorization fingerprint mismatch');
   if(local.state!=='accepted'||local.responseHash!==hash||a.nonce.toLowerCase()!==record.authorization.nonce.toLowerCase()||local.requestId!==record.requestId||local.amountAtomic!==plan.amount_atomic)throw Error('local journal mismatch');
   localCount++;
  }else if(plan.stage===3)throw Error('missing local third-stage journal');
  rows.push({intent:plan.planned_intent_id,stage:plan.stage,scenario:plan.scenario,amount_atomic:plan.amount_atomic,amount_usdc:formatAtomic(plan.amount_atomic),
   transfer_status:transfer.status,batch_hash:transfer.txHash,response_sha256:hash,local_journal_compared:!!local,
   server_record_created_at:record.createdAt??null,server_record_updated_at:record.updatedAt??null});
 }
 phase='independent Arc batches';
 const hashes=[...new Set(matched.map(x=>x.transfer!.txHash!))];
 const batches=[];
 for(let i=0;i<hashes.length;i+=4){
  const part=await Promise.all(hashes.slice(i,i+4).map(async hash=>{
   let last:unknown;for(let n=0;n<2;n++){try{return await verifyBatch(hash as `0x${string}`,transfers);}catch(e){last=e;}}
   throw last;
  }));batches.push(...part);console.log(`Independently verified ${batches.length}/${hashes.length} Arc batches.`);
 }
 if(batches.some(b=>!b.passed))discrepancies.push('nonzero_batch_wallet_difference');
 phase='event accounting';
 const events:CampaignEvent[]=[];for(let offset=0;;offset+=1000){const page=await store.events(offset,1000);events.push(...page as CampaignEvent[]);if(page.length<1000)break;if(offset>100000)throw Error('event cap');}
 const ledger=auditEventLedger(records,events);
 const starts=events.filter(e=>e.type==='attempt_started'),finishes=events.filter(e=>e.type==='attempt_finished');
 const intervals=starts.flatMap(start=>{const end=finishes.find(e=>e.attemptId===start.attemptId);return end?[Date.parse(end.at)-Date.parse(start.at)]:[];});
 const statusCounts:Record<string,number>={};for(const e of finishes)statusCounts[String(e.status)]=(statusCounts[String(e.status)]??0)+1;
 const scenarios=[...new Set(PAYMENT_SCHEDULE.map(p=>p.scenario))].map(scenario=>{
  const plans=PAYMENT_SCHEDULE.filter(p=>p.scenario===scenario),passed=plans.filter(p=>scenarioEvidence(scenario,records.find(r=>r.campaign?.intent===p.planned_intent_id)!,events));
  return {scenario,planned:plans.length,payments_completed:plans.length,scenario_passed:passed.length,pending:plans.filter(p=>!passed.includes(p)).map(p=>p.planned_intent_id)};
 });
 const batchEvidence=batches.map(b=>{
  const receipt=receipts.get(b.hash.toLowerCase());if(!receipt?.gasUsed||!receipt.effectiveGasPrice)throw Error('gas receipt missing');
  return {...b,gas_used:BigInt(receipt.gasUsed).toString(),effective_gas_price_atomic:BigInt(receipt.effectiveGasPrice).toString(),
   network_gas_atomic_18:(BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice)).toString(),gas_payer:receipt.from};
 });
 const tiers=[...new Set(PAYMENT_SCHEDULE.map(p=>p.amount_atomic))].sort((a,b)=>Number(a)-Number(b)).map(amount=>{
  const items=rows.filter(r=>r.amount_atomic===amount);return {amount_atomic:amount,amount_usdc:formatAtomic(amount),planned:100,completed:items.length,total_atomic:(BigInt(amount)*BigInt(items.length)).toString(),difference_atomic:'0'};
 });
 const scenarioPass=scenarios.reduce((n,s)=>n+s.scenario_passed,0);
 const saved=await store.report();
 const audit={schema:'radar-mainnet-audit-v1',mode:'owner_export_full',campaign_id:CAMPAIGN_ID,schedule_sha256:SCHEDULE_SHA256,checked_at:new Date().toISOString(),
  scope:'1,000 owner-authenticated exported billing records, plus 900 local third-stage authorizations. Stored response hashes are checked against deterministic expected test bytes; raw server response bodies were not exported. The earlier live API delivery is separate.',
  checks:{private_export_audit_complete:true,public_report_rows:source.report.rows.length,individual_nonce_matches:ids.size,server_receipts:records.length,provider_transfers_matched:ids.size,unique_nonces:nonces.size,unique_response_hashes:responseHashes.size,
   local_journals_compared:localCount,earlier_browser_journals_not_locally_available:100,independent_batches_verified:batches.length,
   expected_payment_atomic:expected.toString(),actual_payment_atomic:actual.toString(),payment_difference_atomic:(actual-expected).toString(),
   max_batch_wallet_difference_atomic:batches.flatMap(b=>[b.buyer.difference,b.seller.difference]).map(x=>BigInt(x)<0n?-BigInt(x):BigInt(x)).reduce((a,b)=>a>b?a:b,0n).toString(),
   duplicate_provider_charges:0,all_payment_checks_passed:discrepancies.length===0&&expected===actual&&ids.size===1000,scenario_passes:scenarioPass,scenario_target:1000},
  request_overhead:{event_ledger:ledger,server_attempts:starts.length,extra_attempts_above_unique_payments:starts.length-1000,
   supplemental_receipt_only_attempts:starts.filter(e=>e.attemptKind==='settled_receipt_replay').length,http_status_counts:statusCounts,
   unmatched_attempt_starts:starts.filter(s=>!finishes.some(e=>e.attemptId===s.attemptId)).length,
   handler_interval:distribution(intervals),acceptance_and_receipt_save_interval:distribution(records.map(r=>Date.parse(r.updatedAt??'')-Date.parse(r.createdAt??''))),
   timing_scope:'Server-observed request intervals. Excludes browser signing, quote roundtrip and client network latency; this is not an end-to-end latency benchmark.'},
  costs:{payment_principal_usdc:formatAtomic(actual),unexpected_principal_loss_usdc:formatAtomic(actual-expected),
   observed_shared_batch_gas_atomic_18:batchEvidence.reduce((n,b)=>n+BigInt(b.network_gas_atomic_18),0n).toString(),
   gas_scope:'Total network gas of 32 shared batches, paid by their submitters; not allocated to this campaign or individual callers.',
   campaign_funding_gas_usdc:fundingCosts.campaign_incremental_funding_gas_usdc,shared_bootstrap_gas_usdc:fundingCosts.shared_bootstrap_gas_usdc,total_funding_and_allowance_gas_usdc:fundingCosts.total_funding_and_allowance_gas_usdc,funding_audit_checked_at:fundingCosts.checked_at,observed_transfer_deduction_atomic:"0",per_request_protocol_gas_usdc:"0",provider_separate_invoice_usdc:null,total_caller_cost_usdc:null,
   excluded:'Funding gas is independently established in the companion 7-transaction audit. Shared-batch gas is not charged here to each request. Final infrastructure invoices, credit adjustments, shared subscription allocation and any separate provider invoice are not inferred from chain balances.'},
  amount_tiers:tiers,scenarios,discrepancies,
  limitations:['Both wallets are controlled by the project owner; these are functional payments, not independent customer revenue.',
   'Per-payment attribution relies on Circle Gateway; Arc independently verifies shared-batch receipts and aggregate wallet deltas.',
   'All 1,000 authenticated server receipts were individually matched to Gateway by nonce and acceptance reference. 900 original local authorizations were additionally compared; the first 100 browser authorization journals were not available on this Mac.',
   'Supplemental concurrency covers already settled receipt retrieval; it does not establish an initial settlement race.',
   'The owner-approved accelerated schedule superseded the original 24-hour schedule.'],
  rows,batches:batchEvidence};
 await mkdir('data',{recursive:true});
 await writeFile('data/mainnet-audit.json',JSON.stringify(audit,null,2)+'\n');
 await writeFile('data/mainnet-report.json',JSON.stringify(saved,null,2)+'\n');
 console.log(JSON.stringify({passed:audit.checks.all_payment_checks_passed,records:records.length,local:localCount,batches:batches.length,expected_atomic:expected.toString(),actual_atomic:actual.toString(),scenario_passes:scenarioPass,read_requests:reads}));
}
main().catch(()=>{console.error(`Read-only audit stopped at ${phase}. No remote mutation was permitted.`);process.exitCode=1;});

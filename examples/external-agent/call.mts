/** OWNER-RUN reference only. The assistant must never invoke --execute or handle a real key. */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir,rmdir } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import { getArcConfig,parseUsdcAtomic } from "../../lib/arc";
import { signalEndpoint } from "../../lib/agent-http";
import { agentCall,type AgentCallJournal } from "../../lib/agent-call";
import { privateDirectory,readPrivateJson,writePrivateJson } from "../../lib/validation-local-files";
import { selectNetwork } from "../../lib/validation-local-network";
import { createAgentNetwork } from "../../lib/agent-network";
import { DisciplineEngine } from "../../lib/discipline";
async function main(){
 const args=process.argv.slice(2),allowed=new Set(["--execute","--help","--request-id","--proxy"]);
 for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error("Use --help");if(["--request-id","--proxy"].includes(args[i])&&!args[++i])throw Error("Request ID missing");}
 if(args.includes("--help")){console.log("agent:call: free readiness/quote probe. --execute: resume one durable paid call. --request-id UUID: explicitly select another logical call, still bounded by the daily budget. No automatic funding or treasury actions.");return;}
 const proxyIndex=args.indexOf("--proxy"),choice=await selectNetwork(proxyIndex<0?undefined:args[proxyIndex+1]);
 if(!args.includes("--execute")){
  process.env.ARC_NETWORK="mainnet";process.env.BASE_URL??="https://radar-agent-ivory.vercel.app";process.env.SELLER_ADDRESS??="0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C";
  globalThis.fetch=createAgentNetwork(new URL(process.env.BASE_URL).origin,choice).fetcher;
  await import(new URL("./probe.mts",import.meta.url).href);return;
 }
 // Local owner configuration is loaded only in explicitly requested execution.
 try{process.loadEnvFile('.env.mainnet.local');}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 process.env.ARC_NETWORK="mainnet";
 const arc=getArcConfig(),seller=process.env.SELLER_ADDRESS??"0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C",payer=process.env.BUYER_ADDRESS,key=process.env.BUYER_PRIVATE_KEY;
 if(!payer||!key||!/^0x[0-9a-f]{64}$/i.test(key))throw Error("Configure your approved BUYER_ADDRESS and local BUYER_PRIVATE_KEY first");
 const signer=privateKeyToAccount(key as `0x${string}`);if(signer.address.toLowerCase()!==payer.toLowerCase())throw Error("Key does not match approved buyer");
 const maximum=parseUsdcAtomic(process.env.SIGNAL_MAX_PRICE_USDC??"0.001").toString(),cap=Number(process.env.DATA_DAILY_CAP_USDC??"0.001");
 if(!Number.isFinite(cap)||cap<=0||BigInt(maximum)>1000n)throw Error("Reference call is capped at 0.001 USDC; use a positive explicit daily budget");
 const parent=join(homedir(),'.radar-agent-api'),networkRoot=join(parent,'mainnet'),root=join(networkRoot,`calls-${payer.toLowerCase()}`);
 await privateDirectory(parent);await privateDirectory(networkRoot);await privateDirectory(root);
 const lock=join(root,'.call-lock');await mkdir(lock,{mode:0o700});
 try{
  const index=args.indexOf('--request-id'),id=index<0?undefined:args[index+1];
  if(id&&!/^[0-9a-f-]{36}$/i.test(id))throw Error("Use a UUID request ID");
  const file=join(root,id?`${id}.json`:'first-call.json'),old=await readPrivateJson<AgentCallJournal>(file),requestId=old?.requestId??id??randomUUID();
  const budgetFile=join(root,'budget.json'),discipline=new DisciplineEngine(budgetFile,join(root,'audit.jsonl'),{data:cap,treasury:0});
  if(!old)discipline.preflight();
  const budget=await readPrivateJson<{reservations:Record<string,{status:string;amountMicrounits:number;transaction?:string}>}>(budgetFile),held=budget?.reservations[`api:${requestId}`];
  if(old&&(!held||held.amountMicrounits!==Number(old.amountAtomic)||!["pending","unknown","settled"].includes(held.status)))throw Error("Saved call has no matching retained budget reservation");
  const transport=createAgentNetwork(new URL(process.env.BASE_URL??"https://radar-agent-ivory.vercel.app").origin,choice);
  const result=await agentCall({fetcher:transport.fetcher,endpoint:signalEndpoint(process.env.BASE_URL??"https://radar-agent-ivory.vercel.app"),network:arc,payer,seller,maximumAtomic:maximum,requestId,signer,
   load:()=>readPrivateJson<AgentCallJournal>(file),save:j=>writePrivateJson(file,j),reserve:(amount,id)=>{const value=Number(amount)/1000000;discipline.authorizeSpend('data',value);discipline.reserveSpend(`api:${id}`,'data',value);}});
  if(held?.status==="settled"){
   if(held.transaction!==result.journal.paymentReference)throw Error("Saved receipt differs from settled budget");
  }else discipline.settleSpend(`api:${requestId}`,Number(result.journal.amountAtomic)/1000000,result.journal.paymentReference!);
  console.log(JSON.stringify({requestId,status:result.journal.state,amount_atomic:result.journal.amountAtomic,response_sha256:result.journal.responseHash,
   gateway_reference:result.journal.paymentReference,payment_status:'gateway_accepted_not_onchain_verified',recovered:result.recovered,
   quote_ms:result.journal.quoteMs,signing_ms:result.journal.signingMs,http_attempts:result.journal.attempts.length,
   response:result.journal.response,note:'Recovered content may be old; assess its timestamp before using it as fresh data.'},null,2));
 }finally{await rmdir(lock);}
}
main().catch(()=>{console.error("Agent call stopped. Retain the private record and reserved budget; inspect configuration or reconcile the same call. No automatic deposit or new-authorization retry.");process.exitCode=1;});

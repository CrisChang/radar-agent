import test from "node:test";
import assert from "node:assert/strict";
import { agentCall,type AgentCallJournal } from "../lib/agent-call";
import { getArcConfig } from "../lib/arc";
import { buildPaymentRequirements } from "../lib/x402";
import { encodeProtocolJson,responseDigest,decodeProtocolJson } from "../lib/protocol";
process.env.ARC_NETWORK="mainnet";process.env.SELLER_ADDRESS="0x1111111111111111111111111111111111111111";
const arc=getArcConfig(),payer="0x2222222222222222222222222222222222222222",seller=process.env.SELLER_ADDRESS!,id="11111111-1111-4111-8111-111111111111",endpoint=new URL("https://radar.example/api/signals/latest?symbol=ETH-USD");
function fixture(){let journal:AgentCallJournal|null=null,signatures=0,reservations=0,requests=0,lose=false;
 const deps={endpoint,network:arc,payer,seller,maximumAtomic:"1000",requestId:id,signer:{address:payer as `0x${string}`,async signTypedData(){signatures++;return `0x${"ab".repeat(65)}` as `0x${string}`;}},
  async load(){return journal;},async save(j:AgentCallJournal){journal=structuredClone(j);},reserve(){reservations++;},
  fetcher:async(_url:unknown,init?:RequestInit)=>{
   requests++;const h=new Headers(init?.headers);
   if(!h.has("payment-signature"))return new Response("{}",{status:402,headers:{"payment-required":encodeProtocolJson({x402Version:2,accepts:[buildPaymentRequirements("0.001")],resource:{url:endpoint.toString()}})}});
   assert.ok(journal?.paymentHeader);assert.equal(journal.state,"submitted");assert.equal(h.get("payment-signature"),journal.paymentHeader);
   if(lose)throw Error("synthetic response loss");const body=JSON.stringify({signal_id:"synthetic-only",ts:"2020-01-01T00:00:00Z"});
   return new Response(body,{headers:{"x-radar-request-id":id,"x-radar-response-sha256":await responseDigest(body),"x-radar-payment-state":"gateway_accepted_not_onchain_verified",
    "payment-response":encodeProtocolJson({success:true,network:arc.network,payer,transaction:"synthetic-acceptance-reference"})}});
  }};
 return {deps,get journal(){return journal;},get signatures(){return signatures;},get reservations(){return reservations;},get requests(){return requests;},set lose(v:boolean){lose=v;}};
}
test("call durably saves authorization before submission and returns an accepted cached record without paying again",async()=>{
 const f=fixture(),first=await agentCall(f.deps);assert.equal(first.journal.state,"accepted");assert.equal(f.signatures,1);assert.equal(f.reservations,1);
 assert.equal(first.journal.attempts.length,1);assert.ok(first.journal.quoteMs>=0);assert.ok(first.journal.signingMs!>=0);
 const count=f.requests,second=await agentCall(f.deps);assert.equal(second.recovered,true);assert.equal(f.requests,count);assert.equal(f.signatures,1);
});
test("lost response retains budget and exact authorization; explicit resume replays without quote or new signature",async()=>{
 const f=fixture();f.lose=true;await assert.rejects(agentCall(f.deps),/outcome unknown/);const original=f.journal!.paymentHeader;
 assert.equal(f.journal!.state,"unknown");assert.equal(f.reservations,1);f.lose=false;const count=f.requests;
 const result=await agentCall(f.deps);assert.equal(result.recovered,true);assert.equal(f.requests,count+1);assert.equal(f.signatures,1);assert.equal(f.reservations,1);assert.equal(result.journal.paymentHeader,original);assert.equal(result.journal.attempts.length,2);
});
test("ambiguous signing cannot create a replacement authorization on restart",async()=>{
 const f=fixture();f.deps.signer.signTypedData=async()=>{throw Error("synthetic signer interruption");};await assert.rejects(agentCall(f.deps));
 assert.equal(f.journal!.state,"signing");const count=f.requests;await assert.rejects(agentCall(f.deps),/Signature outcome unresolved/);assert.equal(f.requests,count);assert.equal(f.reservations,1);
});
test("mutated saved amount or request identity is rejected before replay",async()=>{
 for(const issue of ["amount","request"]){const f=fixture();await agentCall(f.deps);const j=f.journal!;
  if(issue==="amount"){const p=decodeProtocolJson(j.paymentHeader!) as any;p.payload.authorization.value="999";j.paymentHeader=encodeProtocolJson(p);}
  else j.requestId="22222222-2222-4222-8222-222222222222";
  const count=f.requests;await assert.rejects(agentCall(f.deps));assert.equal(f.requests,count);assert.equal(f.signatures,1);
 }
});
test("changed delivery digest remains unknown instead of being counted as a paid success",async()=>{
 const f=fixture(),original=f.deps.fetcher;f.deps.fetcher=async(u,init)=>{const r=await original(u,init);if(r.status===200)r.headers.set("x-radar-response-sha256","0".repeat(64));return r;};
 await assert.rejects(agentCall(f.deps));assert.equal(f.journal!.state,"unknown");assert.ok(f.journal!.paymentHeader);assert.equal(f.reservations,1);
});
test("over-budget quote fails before reservation and signing",async()=>{
 const f=fixture();f.deps.maximumAtomic="999";await assert.rejects(agentCall(f.deps));assert.equal(f.reservations,0);assert.equal(f.signatures,0);assert.equal(f.journal,null);
});

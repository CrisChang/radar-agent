import type { PaymentRecord } from "./payment-store";
import type { CampaignEvent } from "./validation-store";

/** Read-only consistency checks; returns counts, never private event identifiers. */
export function auditEventLedger(records: PaymentRecord[], events: CampaignEvent[]) {
 const byIntent=new Map(records.map(r=>[r.campaign!.intent,r])),byKey=new Map(records.map(r=>[r.paymentKey,r]));
 const starts=new Map<string,{event:CampaignEvent;index:number}>(),finished=new Set<string>(),claimed=new Set<string>(),states=new Map<string,string>();
 let transitions=0;
 for(let index=0;index<events.length;index++){
  const e=events[index];
  if(!e||typeof e.type!=="string"||!Number.isFinite(Date.parse(e.at)))throw Error("Malformed event timestamp or type");
  if(e.type==="attempt_started"||e.type==="attempt_finished"||e.type==="claimed"){
   const r=byIntent.get(e.intent??"");if(!r||e.requestId!==r.requestId)throw Error("Event request does not match receipt");
   if(e.type==="claimed"){
    if(claimed.has(e.intent!)||e.amountAtomic!==r.terms!.amountAtomic)throw Error("Duplicate claim or amount mismatch");
    claimed.add(e.intent!);states.set(r.paymentKey,"preparing");
   }else if(e.type==="attempt_started"){
    if(!e.attemptId||starts.has(e.attemptId)||!/^[a-f0-9]{64}$/i.test(e.fingerprint??""))throw Error("Duplicate or malformed attempt start");
    starts.set(e.attemptId,{event:e,index});
   }else{
    const start=starts.get(e.attemptId??"");
    if(!start||finished.has(e.attemptId!)||start.index>=index||start.event.intent!==e.intent||Date.parse(e.at)<Date.parse(start.event.at)||!Number.isInteger(e.status)||e.status!<100||e.status!>599)throw Error("Missing, duplicate or inconsistent attempt finish");
    if(e.status===200&&start.event.fingerprint!==r.fingerprint)throw Error("Successful attempt differs from accepted authorization");
    finished.add(e.attemptId!);
   }
  }
  if(e.type==="transition"){
   if(!e.paymentKey||!byKey.has(e.paymentKey))throw Error("Transition has no matching receipt");
   const previous=states.get(e.paymentKey),allowed:Record<string,string[]>={preparing:["settling","rejected"],settling:["accepted","unknown"]};
   if(!previous||!allowed[previous]?.includes(e.state??""))throw Error("Invalid recorded state order");
   states.set(e.paymentKey,e.state!);transitions++;
  }
  if(e.type==="reconciled_accepted"){
   const r=byIntent.get(e.intent??"");if(!r||!["settling","unknown"].includes(states.get(r.paymentKey)??""))throw Error("Invalid recovered acceptance");
   states.set(r.paymentKey,"accepted");
  }
 }
 if(claimed.size!==records.length||records.some(r=>states.get(r.paymentKey)!=="accepted")||finished.size!==starts.size)throw Error("Incomplete claim, state or attempt ledger");
 return {events:events.length,unique_claims:claimed.size,state_transitions:transitions,paired_attempts:finished.size,unmatched_starts:starts.size-finished.size};
}

import test from "node:test";
import assert from "node:assert/strict";
import { auditEventLedger } from "../lib/mainnet-audit-events";
import type { PaymentRecord } from "../lib/payment-store";
import type { CampaignEvent } from "../lib/validation-store";
function fixture(){
 const record={paymentKey:"key",requestId:"request",fingerprint:"a".repeat(64),campaign:{intent:"planned-0001"},terms:{amountAtomic:"100"}} as PaymentRecord;
 const common={at:"2026-10-14T00:00:00.000Z",intent:"planned-0001",requestId:"request"};
 const events:CampaignEvent[]=[{...common,type:"attempt_started",attemptId:"attempt",fingerprint:record.fingerprint},{...common,type:"claimed",amountAtomic:"100"},
  {type:"transition",at:common.at,paymentKey:"key",state:"settling"},{type:"transition",at:common.at,paymentKey:"key",state:"accepted"},
  {...common,type:"attempt_finished",attemptId:"attempt",status:200}];return {record,events};
}
test("event audit links claims, state transitions and paired attempts to the original receipt",()=>{
 const {record,events}=fixture();assert.deepEqual(auditEventLedger([record],events),{events:5,unique_claims:1,state_transitions:2,paired_attempts:1,unmatched_starts:0});
});
test("event audit refuses incomplete, duplicate, altered or reordered records",()=>{
 for(const issue of ["finish","duplicate","amount","identity","fingerprint","state","timestamp"]){
  const {record,events}=fixture();if(issue==="finish")events.pop();if(issue==="duplicate")events.push(events[4]);if(issue==="amount")events[1].amountAtomic="1";
  if(issue==="identity")events[4].requestId="different";if(issue==="fingerprint")events[0].fingerprint="b".repeat(64);if(issue==="state")[events[2],events[3]]=[events[3],events[2]];if(issue==="timestamp")events[4].at="invalid";
  assert.throws(()=>auditEventLedger([record],events),issue);
 }
});

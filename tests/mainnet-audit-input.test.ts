import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { auditRecords } from "../lib/mainnet-audit-input";
import { getArcConfig } from "../lib/arc";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, intentRequestId } from "../lib/validation-plan";
const arc=getArcConfig({ARC_NETWORK:"mainnet"}),payer="0x2222222222222222222222222222222222222222",seller="0x1111111111111111111111111111111111111111";
function fixture(){return {receipts:{campaign:CAMPAIGN_ID,kind:"receipts",items:PAYMENT_SCHEDULE.map(p=>({campaign:{id:CAMPAIGN_ID,intent:p.planned_intent_id},status:"accepted",request_id:intentRequestId(p),
 amount_atomic:p.amount_atomic,network:arc.network,payer,pay_to:seller,asset:arc.usdc,nonce:`0x${p.ordinal.toString(16).padStart(64,"0")}`,bill_id:p.ordinal.toString(16).padStart(64,"0"),fingerprint:"f".repeat(64),
 payment:{reference:"11111111-1111-4111-8111-111111111111"},response_sha256:createHash("sha256").update(JSON.stringify({campaign_id:CAMPAIGN_ID,intent:p.planned_intent_id,purpose:"owner_controlled_payment_reliability_test",amount_atomic:p.amount_atomic,scenario:p.scenario})).digest("hex")}))},events:{campaign:CAMPAIGN_ID,kind:"events",items:[]}};}
test("owner billing exports map all frozen amounts and stored expected-response digests without a key or network",()=>{
 const f=fixture(),before=JSON.stringify(f),result=auditRecords(f.receipts,f.events,arc,payer,seller);
 assert.equal(result.records.length,1000);assert.equal(result.records.reduce((n,r)=>n+BigInt(r.terms!.amountAtomic),0n),232600n);
 assert.equal(JSON.stringify(f),before);assert.equal(result.records[0].response?.status,200);
});
test("audit refuses missing rows, wrong owner, amount, nonce duplicates, response corruption and altered request identity",()=>{
 for(const issue of ["missing","owner","amount","nonce","duplicate","digest","request","reference","campaign"]){
  const f=fixture(),row=f.receipts.items[1];
  if(issue==="missing")f.receipts.items.pop();if(issue==="owner")row.payer=seller;if(issue==="amount")row.amount_atomic="999999";
  if(issue==="nonce")row.nonce=f.receipts.items[0].nonce;if(issue==="duplicate")f.receipts.items[1]=f.receipts.items[0];
  if(issue==="digest")row.response_sha256="0".repeat(64);if(issue==="request")row.request_id="changed";if(issue==="reference")row.payment.reference="not-a-provider-reference";
  if(issue==="campaign")row.campaign.id="different";
  assert.throws(()=>auditRecords(f.receipts,f.events,arc,payer,seller),issue);
 }
});

import { createHash } from "node:crypto";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, intentRequestId } from "./validation-plan";
import type { ArcConfig } from "./arc";
import type { PaymentRecord } from "./payment-store";

/** Parses the existing owner-only exports; never reads credentials or sends data. */
export function auditRecords(receipts: unknown, events: unknown, arc: ArcConfig, payer: string, seller: string): { records: PaymentRecord[]; events: unknown[] } {
 const exported=receipts as {campaign?:unknown;kind?:unknown;items?:unknown[]}, log=events as {campaign?:unknown;kind?:unknown;items?:unknown[]};
 if(!exported||exported.campaign!==CAMPAIGN_ID||exported.kind!=="receipts"||!Array.isArray(exported.items)||exported.items.length!==1000||
  !log||log.campaign!==CAMPAIGN_ID||log.kind!=="events"||!Array.isArray(log.items)||log.items.length>100000)throw new Error("Incomplete or mismatched owner exports");
 const ids=new Set<string>(),nonces=new Set<string>();
 const records=exported.items.map(item=>{
  const b=item as Record<string,any>, plan=PAYMENT_SCHEDULE.find(p=>p.planned_intent_id===b.campaign?.intent);
  if(!plan||b.campaign?.id!==CAMPAIGN_ID||ids.has(plan.planned_intent_id)||b.status!=="accepted"||b.request_id!==intentRequestId(plan)||b.amount_atomic!==plan.amount_atomic||
   b.network!==arc.network||typeof b.payer!=="string"||b.payer.toLowerCase()!==payer.toLowerCase()||typeof b.pay_to!=="string"||b.pay_to.toLowerCase()!==seller.toLowerCase()||
   typeof b.asset!=="string"||b.asset.toLowerCase()!==arc.usdc.toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(b.nonce??"")||nonces.has(String(b.nonce).toLowerCase())||
   !/^[0-9a-f]{64}$/i.test(b.bill_id??"")||!/^[0-9a-f]{64}$/i.test(b.fingerprint??"")||typeof b.payment?.reference!=="string"||
   !(/^[0-9a-f-]{36}$/i.test(b.payment.reference)||/^0x[0-9a-f]{64}$/i.test(b.payment.reference)))throw new Error("Private bill scope or uniqueness differs from plan");
  ids.add(plan.planned_intent_id);nonces.add(b.nonce.toLowerCase());
  const body=JSON.stringify({campaign_id:CAMPAIGN_ID,intent:plan.planned_intent_id,purpose:"owner_controlled_payment_reliability_test",amount_atomic:plan.amount_atomic,scenario:plan.scenario});
  if(createHash("sha256").update(body).digest("hex")!==b.response_sha256)throw new Error("Saved digest differs from expected test response");
  return {paymentKey:b.bill_id,requestKey:"not_exported",fingerprint:b.fingerprint,requestId:b.request_id,state:"accepted" as const,createdAt:b.created_at,updatedAt:b.updated_at,
   authorization:{payer:b.payer.toLowerCase(),nonce:b.nonce.toLowerCase(),network:b.network,gatewayWallet:arc.gatewayWallet},terms:{amountAtomic:b.amount_atomic,asset:b.asset,payTo:b.pay_to},campaign:b.campaign,
   response:{status:200,body,headers:{"x-radar-response-sha256":b.response_sha256,"payment-response":Buffer.from(JSON.stringify({success:true,network:b.network,payer:b.payer,transaction:b.payment.reference})).toString("base64")}}};
 });
 return {records,events:log.items};
}

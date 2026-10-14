import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { discoverSignal } from "./agent-http";
import { assertUnchangedOffer, validateOffer } from "./agent-contract";
import { encodeProtocolJson, decodeProtocolJson, responseDigest } from "./protocol";
import type { ArcConfig } from "./arc";
type Signer=ConstructorParameters<typeof BatchEvmScheme>[0];
export interface AgentCallJournal {
 requestId:string;endpoint:string;payer:string;seller:string;maximumAtomic:string;amountAtomic:string;
 state:"signing"|"signed"|"submitted"|"accepted"|"unknown";createdAt:string;paymentHeader?:string;
 responseHash?:string;response?:Record<string,unknown>;paymentReference?:string;
 quoteMs:number;signingMs?:number;attempts:{at:string;elapsedMs:number;status:number|null;outcome:string}[];
}
interface CallDependencies {
 endpoint:URL;network:ArcConfig;payer:string;seller:string;maximumAtomic:string;requestId:string;signer:Signer;fetcher?:typeof fetch;
 load():Promise<AgentCallJournal|null>;save(j:AgentCallJournal):Promise<void>;reserve(amountAtomic:string,requestId:string):void;
}
/** One durable paid-call identity. No funding, treasury action, fresh nonce on
 * uncertainty, transport retry, or claim that API acceptance is a chain proof. */
export async function agentCall(d:CallDependencies){
 const fetcher=d.fetcher??fetch;let j=await d.load();
 if(!/^[0-9a-f-]{36}$/i.test(d.requestId)||d.signer.address.toLowerCase()!==d.payer.toLowerCase()||d.payer.toLowerCase()===d.seller.toLowerCase())throw Error("Invalid caller identity");
 if(j&&(j.requestId!==d.requestId||j.endpoint!==d.endpoint.toString()||j.payer.toLowerCase()!==d.payer.toLowerCase()||j.seller.toLowerCase()!==d.seller.toLowerCase()||BigInt(j.amountAtomic)>BigInt(d.maximumAtomic)))throw Error("Saved call scope differs; keep the original record");
 if(j?.paymentHeader){
  const p=decodeProtocolJson(j.paymentHeader) as any,a=p.payload?.authorization;
  const offer=validateOffer({x402Version:2,accepts:[p.accepted],resource:p.resource},d.network,d.maximumAtomic);
  if(p.resource?.url!==d.endpoint.toString()||offer.amountAtomic!==j.amountAtomic||offer.payTo.toLowerCase()!==d.seller.toLowerCase()||
   a?.from?.toLowerCase()!==d.payer.toLowerCase()||a?.to?.toLowerCase()!==d.seller.toLowerCase()||String(a?.value)!==j.amountAtomic||!/^0x[0-9a-f]{64}$/i.test(a?.nonce??""))throw Error("Original authorization differs from saved call");
 }
 if(j?.state==="accepted")return {journal:j,recovered:true};
 if(j&&!j.paymentHeader)throw Error("Signature outcome unresolved; retain the reservation and inspect the original record");
 if(!j){
  const started=Date.now(),quote=await discoverSignal(d.endpoint,d.network,d.seller,d.maximumAtomic,d.requestId,fetcher);
  j={requestId:d.requestId,endpoint:d.endpoint.toString(),payer:d.payer,seller:d.seller,maximumAtomic:d.maximumAtomic,amountAtomic:quote.offer.amountAtomic,
   state:"signing",createdAt:new Date().toISOString(),quoteMs:Date.now()-started,attempts:[]};
  d.reserve(j.amountAtomic,j.requestId);await d.save(j);
  const signStart=Date.now(),scheme=new BatchEvmScheme({address:d.signer.address,async signTypedData(params){
   assertUnchangedOffer(quote.selected,quote.offer,d.network);
   if(params.domain.chainId!==d.network.chainId||params.domain.name!=="GatewayWalletBatched"||params.domain.version!=="1"||params.domain.verifyingContract.toLowerCase()!==d.network.gatewayWallet.toLowerCase()||
    String(params.message.from).toLowerCase()!==d.payer.toLowerCase()||String(params.message.to).toLowerCase()!==d.seller.toLowerCase()||String(params.message.value)!==quote.offer.amountAtomic)throw Error("Signing terms changed");
   return d.signer.signTypedData(params);
  }});
  const created=await scheme.createPaymentPayload(2,quote.selected);
  j.paymentHeader=encodeProtocolJson({...created,accepted:quote.selected,resource:quote.resource});j.signingMs=Date.now()-signStart;j.state="signed";
  await d.save(j); // Exact authorization is durable before the first paid HTTP request.
 }
 const active=j,recovered=active.attempts.length>0;active.state="submitted";await d.save(active);const started=Date.now();let status:number|null=null;
 try{
  const response=await fetcher(d.endpoint,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(30000),headers:{"x-radar-request-id":active.requestId,"payment-signature":active.paymentHeader!}});
  status=response.status;if(!response.ok)throw Error("Uncertain paid response");
  const body=await response.text();if(body.length>65536)throw Error("Response too large");
  const hash=await responseDigest(body),receipt=decodeProtocolJson(response.headers.get("payment-response")??"") as any;
  if(hash!==response.headers.get("x-radar-response-sha256")||(active.responseHash&&active.responseHash!==hash)||response.headers.get("x-radar-request-id")!==active.requestId||
   response.headers.get("x-radar-payment-state")!=="gateway_accepted_not_onchain_verified"||receipt.success!==true||receipt.network!==d.network.network||receipt.payer?.toLowerCase()!==d.payer.toLowerCase()||typeof receipt.transaction!=="string"||!receipt.transaction)throw Error("Delivery metadata mismatch");
  const content=JSON.parse(body);if(!content||typeof content!=="object"||Array.isArray(content))throw Error("Invalid response object");
  active.responseHash=hash;active.response=content;active.paymentReference=receipt.transaction;active.state="accepted";
  active.attempts.push({at:new Date().toISOString(),elapsedMs:Date.now()-started,status,outcome:"verified_saved_response"});await d.save(active);
  return {journal:active,recovered};
 }catch{
  active.state="unknown";active.attempts.push({at:new Date().toISOString(),elapsedMs:Date.now()-started,status,outcome:"response_or_transport_unknown"});await d.save(active);
  throw Error("Call outcome unknown. Budget and original authorization retained; resume this same call, never sign a replacement.");
 }
}

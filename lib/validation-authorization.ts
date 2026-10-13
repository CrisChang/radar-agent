import type { ArcConfig } from "./arc";
import { validateOffer } from "./agent-contract";
import type { PlannedPayment } from "./validation-plan";

export const CAMPAIGN_AUTH_WINDOW_SECONDS = 604_800 + 3_600;
export const CAMPAIGN_AUTH_TYPES = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] } as const;
export interface CampaignAuthorization {
  from: `0x${string}`; to: `0x${string}`; value: string;
  validAfter: string; validBefore: string; nonce: `0x${string}`;
}
export interface CampaignPayload {
  x402Version: number; accepted: Record<string, unknown>; resource: { url: string };
  payload: { authorization: CampaignAuthorization; signature: `0x${string}` };
}
export function decodePayment(value: string): unknown {
  if (!value || value.length > 16_384) throw new Error("Invalid saved authorization size");
  return JSON.parse(typeof Buffer === "undefined" ? atob(value) : Buffer.from(value, "base64").toString("utf8"));
}
export function encodePayment(value: unknown): string {
  const text = JSON.stringify(value);
  return typeof Buffer === "undefined" ? btoa(text) : Buffer.from(text).toString("base64");
}
export function campaignTypedData(a: CampaignAuthorization, arc: ArcConfig) {
  return { domain: { name: "GatewayWalletBatched", version: "1", chainId: 5042, verifyingContract: arc.gatewayWallet },
    types: { TransferWithAuthorization: CAMPAIGN_AUTH_TYPES.TransferWithAuthorization.map(field => ({ ...field })) }, primaryType: "TransferWithAuthorization" as const,
    message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce } };
}
export function inspectCampaignPayment(header: string, row: PlannedPayment, terms: { arc: ArcConfig; origin: string; payer: string; seller: string }): CampaignPayload {
  const p = decodePayment(header) as CampaignPayload, a = p?.payload?.authorization;
  if (!a || a.from?.toLowerCase() !== terms.payer.toLowerCase() || a.to?.toLowerCase() !== terms.seller.toLowerCase() ||
      a.value !== row.amount_atomic || !/^\d{1,10}$/.test(a.validAfter) || !/^\d{1,10}$/.test(a.validBefore) ||
      BigInt(a.validBefore) <= BigInt(a.validAfter) || !/^0x[\da-f]{64}$/i.test(a.nonce) || !/^0x[\da-f]{130}$/i.test(p.payload.signature) ||
      p.resource?.url !== `${terms.origin}/api/validation/payment?intent=${row.planned_intent_id}`) throw new Error("Saved authorization scope differs");
  const offer = validateOffer({ x402Version: p.x402Version, accepts: [p.accepted] }, terms.arc, row.amount_atomic, CAMPAIGN_AUTH_WINDOW_SECONDS);
  if (offer.amountAtomic !== row.amount_atomic || offer.payTo.toLowerCase() !== terms.seller.toLowerCase()) throw new Error("Saved quote differs");
  return p;
}

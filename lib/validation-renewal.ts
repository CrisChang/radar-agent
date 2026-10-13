import { verifyTypedData } from "viem";
import { getArcConfig } from "./arc";
import { validateOffer } from "./agent-contract";
import { CAMPAIGN_ID, intentRequestId, type PlannedPayment } from "./validation-plan";
import { CAMPAIGN_AUTH_WINDOW_SECONDS, campaignTypedData, encodePayment, inspectCampaignPayment, type CampaignAuthorization } from "./validation-authorization";
import type { RunnerDependencies } from "./validation-runner";
import { walletRejected } from "./wallet-rejection";

async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
/** Explicit owner action only: check the original, sign a later expiry with
 * the same nonce, and save it. Never submits a payment or generates a nonce. */
export async function renewRejectedAuthorization(row: PlannedPayment, deps: RunnerDependencies) {
  const arc = getArcConfig({ ARC_NETWORK: "mainnet" }), origin = new URL(deps.origin).origin;
  if (origin !== deps.origin || new URL(origin).protocol !== "https:" || deps.signer.address.toLowerCase() !== deps.payer.toLowerCase()) throw new Error("Wrong renewal origin or signer");
  const journal = await deps.load(row.planned_intent_id);
  if (!journal || !["unknown", "signed", "submitted"].includes(journal.state) || !journal.paymentHeader || journal.pendingRenewal || journal.responseHash ||
      journal.campaign !== CAMPAIGN_ID || journal.requestId !== intentRequestId(row) || journal.intent !== row.planned_intent_id ||
      journal.amountAtomic !== row.amount_atomic || journal.origin !== origin || journal.payer.toLowerCase() !== deps.payer.toLowerCase() || journal.seller.toLowerCase() !== deps.seller.toLowerCase()) throw new Error("原授权记录缺失或签名结果未确认，不能续签。请保留记录并核查。");
  const originalHeader = journal.paymentHeader, originalState = journal.state;
  const original = inspectCampaignPayment(originalHeader, row, { arc, origin, payer: deps.payer, seller: deps.seller });
  const old = original.payload.authorization;
  if (journal.nonce?.toLowerCase() !== old.nonce.toLowerCase()) throw new Error("Original nonce differs from the journal");
  const response = await (deps.fetcher ?? fetch)(`${origin}/api/validation/recovery?intent=${row.planned_intent_id}`, {
    headers: { "payment-signature": originalHeader }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error("尚未证明原授权可安全续签。未签新授权、未付款；请只读核查原记录。");
  const proof = await response.json() as { campaign_id: string; intent: string; status: string; original_header_sha256: string;
    authorization: CampaignAuthorization; requirements: Record<string, unknown>; resource: { url: string }; issued_at: number; expires_at: number; settlement_attempted: boolean };
  const a = proof.authorization, now = Math.floor(Date.now() / 1000);
  if (proof.campaign_id !== CAMPAIGN_ID || proof.intent !== row.planned_intent_id || proof.status !== "ready_for_owner_same_nonce_renewal" ||
      proof.settlement_attempted !== false || proof.original_header_sha256 !== await sha256(originalHeader) ||
      !Number.isSafeInteger(proof.issued_at) || !Number.isSafeInteger(proof.expires_at) || proof.expires_at !== proof.issued_at + 120 ||
      proof.issued_at > now + 30 || proof.expires_at < now || !a ||
      a.from.toLowerCase() !== old.from.toLowerCase() || a.to.toLowerCase() !== old.to.toLowerCase() || a.value !== old.value ||
      a.nonce.toLowerCase() !== old.nonce.toLowerCase() || a.validAfter !== old.validAfter ||
      a.validBefore !== String(proof.issued_at + CAMPAIGN_AUTH_WINDOW_SECONDS) || BigInt(a.validBefore) <= BigInt(old.validBefore) ||
      proof.resource?.url !== original.resource.url || proof.requirements?.maxTimeoutSeconds !== CAMPAIGN_AUTH_WINDOW_SECONDS) throw new Error("恢复报价改变了原付款条件，已停止续签。");
  const offer = validateOffer({ x402Version: 2, accepts: [proof.requirements] }, arc, row.amount_atomic, CAMPAIGN_AUTH_WINDOW_SECONDS);
  if (offer.amountAtomic !== row.amount_atomic || offer.payTo.toLowerCase() !== deps.seller.toLowerCase()) throw new Error("Renewal amount or recipient changed");
  journal.pendingRenewal = a; journal.state = "renewing";
  await deps.save(journal); // Preserve the old signature and pending terms before opening the wallet.
  let signature: `0x${string}`;
  try {
    signature = await deps.signer.signTypedData(campaignTypedData(a, arc));
    if (!await verifyTypedData({ ...campaignTypedData(a, arc), address: deps.signer.address, signature })) throw new Error();
  } catch (error) {
    if (walletRejected(error)) {
      journal.state = originalState; delete journal.pendingRenewal;
      journal.attempts.push({ at: new Date().toISOString(), outcome: "validity_renewal_rejected_before_signature" }); await deps.save(journal);
    }
    throw new Error(walletRejected(error) ? "你取消了续签，原记录已保留，未提交付款。" : "续签结果未确认。请保留原记录，停止新签名并核查。");
  }
  journal.renewals = [...(journal.renewals ?? []), { at: new Date().toISOString(), reason: "authorization_validity_too_short", originalPaymentHeader: originalHeader, renewedValidBefore: a.validBefore }];
  journal.paymentHeader = encodePayment({ ...original, accepted: proof.requirements, resource: proof.resource, payload: { authorization: a, signature } });
  journal.nonce = a.nonce; journal.state = "signed"; delete journal.pendingRenewal; delete journal.lastFailure;
  journal.attempts.push({ at: new Date().toISOString(), outcome: "same_nonce_validity_renewed_not_submitted" });
  await deps.save(journal); // No network submission follows this write.
  return journal;
}

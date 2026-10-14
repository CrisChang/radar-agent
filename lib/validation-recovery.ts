import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyTypedData } from "viem";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "./arc";
import { CAMPAIGN_ID, intentRequestId, plannedPayment } from "./validation-plan";
import { CAMPAIGN_AUTH_WINDOW_SECONDS, campaignTypedData, inspectCampaignPayment } from "./validation-authorization";
import { validationStore, type ValidationStore } from "./validation-store";
import { searchAllTransfers, type GatewayTransfer } from "./validation-reconcile";
import { paymentIdentity } from "./payment-store";
import { buildPaymentRequirements, getResourceUrl } from "./x402";

import { effectiveDueTime } from "./validation-timing";

interface RecoveryDependencies {
  store?: Pick<ValidationStore, "state" | "intent" | "find" | "appendEvent">;
  facilitator?: Pick<BatchFacilitatorClient, "verify">;
  transfers?: () => Promise<GatewayTransfer[]>;
}
/** Verification only. This module never calls settle, releases reservations,
 * resets an intent, or chooses a nonce. Renewal keeps the original nonce. */
export async function validationRecovery(request: NextRequest, deps: RecoveryDependencies = {}) {
  const headers = { "cache-control": "no-store" };
  try {
    const arc = getArcConfig(), payer = getPilotBuyerAddress(), seller = getSellerAddress();
    if (arc.mode !== "mainnet" || payer.toLowerCase() === seller.toLowerCase() || [...request.nextUrl.searchParams.keys()].some(k => k !== "intent")) throw new Error();
    const row = plannedPayment(request.nextUrl.searchParams.get("intent") ?? "");
    const originalHeader = request.headers.get("payment-signature") ?? "", origin = new URL(getResourceUrl(request)).origin;
    const payload = inspectCampaignPayment(originalHeader, row, { arc, payer, seller, origin }), authorization = payload.payload.authorization;
    if (!await verifyTypedData({ ...campaignTypedData(authorization, arc), address: payer, signature: payload.payload.signature })) throw new Error();
    const store = deps.store ?? validationStore(); if (!store) throw new Error();
    const state = await store.state(), now = Date.now();
    if (!state || state.halted || state.expiresAt < now || state.stage < row.stage || row.ordinal > state.maximumCount || effectiveDueTime(row, state) > now) throw new Error();
    const identity = paymentIdentity(payload as unknown as { payload: Record<string, unknown> }, arc.network, arc.gatewayWallet,
      intentRequestId(row), `GET:/api/validation/payment?intent=${row.planned_intent_id}`);
    const hasReservation = async () => !!(await store.intent(row.planned_intent_id) || await store.find(identity.paymentKey, identity.requestKey));
    if (await hasReservation()) return NextResponse.json({ error: "Original intent or nonce is reserved. Reconcile only; renewal is blocked." }, { status: 409, headers });
    // Confirm the exact original owner signature is rejected before settlement.
    // A transport failure, used nonce, other rejection or valid signature cannot renew.
    const facilitator = deps.facilitator ?? new BatchFacilitatorClient({ url: arc.facilitatorUrl });
    const verification = await facilitator.verify(payload as unknown as Parameters<BatchFacilitatorClient["verify"]>[0], payload.accepted as unknown as Parameters<BatchFacilitatorClient["verify"]>[1]);
    if (verification.isValid || verification.invalidReason !== "authorization_validity_too_short") return NextResponse.json({
      error: "Original authorization is not conclusively rejected for short validity. Keep it unchanged and reconcile." }, { status: 409, headers });
    const transfers = await (deps.transfers ?? searchAllTransfers)();
    if (transfers.some(t => t.nonce.toLowerCase() === authorization.nonce.toLowerCase() && t.fromAddress.toLowerCase() === payer.toLowerCase())) return NextResponse.json({
      error: "Gateway already has this nonce. Renewal is blocked; reconcile the existing transfer." }, { status: 409, headers });
    if (await hasReservation()) return NextResponse.json({ error: "Reservation changed during checks. Reconcile only." }, { status: 409, headers });
    const issuedAt = Math.floor(Date.now() / 1000);
    if (BigInt(authorization.validBefore) >= BigInt(issuedAt + 604_800)) throw new Error();
    await store.appendEvent({ type: "validity_renewal_prepared", at: new Date().toISOString(), intent: row.planned_intent_id,
      paymentKey: identity.paymentKey, fingerprint: identity.fingerprint, reason: "authorization_validity_too_short", amountAtomic: row.amount_atomic });
    return NextResponse.json({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id, status: "ready_for_owner_same_nonce_renewal",
      original_header_sha256: createHash("sha256").update(originalHeader).digest("hex"),
      authorization: { ...authorization, validBefore: String(issuedAt + CAMPAIGN_AUTH_WINDOW_SECONDS) },
      requirements: buildPaymentRequirements(row.amount_usdc, CAMPAIGN_AUTH_WINDOW_SECONDS), resource: payload.resource,
      issued_at: issuedAt, expires_at: issuedAt + 120, settlement_attempted: false,
      note: "Owner must review and sign. Same intent, nonce, amount, payer and seller; only validBefore changes. No payment is submitted by this check." }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not establish safe same-nonce renewal. No payment submitted; keep the original journal and reconcile." }, { status: 409, headers });
  }
}

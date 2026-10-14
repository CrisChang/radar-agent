import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "./arc";
import { CAMPAIGN_ID, intentRequestId, type PlannedPayment } from "./validation-plan";
import type { paymentIdentity, PaymentRecord } from "./payment-store";

/** Receipt-only path. Deliberately has no claim, transition, quote or facilitator dependency. */
export async function replayAcceptedCampaign(row: PlannedPayment, identity: ReturnType<typeof paymentIdentity>,
  store: { intent(id: string): Promise<PaymentRecord | null> }) {
  const headers = { "cache-control": "no-store" };
  try {
    const r = await store.intent(row.planned_intent_id), arc = getArcConfig();
    if (row.scenario !== "concurrent_same_authorization_replay" || !r || r.state !== "accepted" ||
        r.campaign?.id !== CAMPAIGN_ID || r.campaign.intent !== row.planned_intent_id ||
        r.requestId !== intentRequestId(row) || r.paymentKey !== identity.paymentKey || r.requestKey !== identity.requestKey ||
        r.fingerprint !== identity.fingerprint || r.authorization?.payer.toLowerCase() !== getPilotBuyerAddress().toLowerCase() ||
        r.authorization.network !== arc.network || r.authorization.nonce !== identity.authorization.nonce ||
        r.authorization.gatewayWallet.toLowerCase() !== arc.gatewayWallet.toLowerCase() || r.terms?.amountAtomic !== row.amount_atomic ||
        r.terms.payTo.toLowerCase() !== getSellerAddress().toLowerCase() || r.terms.asset.toLowerCase() !== arc.usdc.toLowerCase() ||
        !r.response || r.response.status !== 200 ||
        r.response.headers["x-radar-response-sha256"] !== createHash("sha256").update(r.response.body).digest("hex")) throw new Error("Receipt mismatch");
    const body = JSON.parse(r.response.body), receipt = JSON.parse(Buffer.from(r.response.headers["payment-response"] ?? "", "base64").toString("utf8"));
    if (body.campaign_id !== CAMPAIGN_ID || body.intent !== row.planned_intent_id || body.amount_atomic !== row.amount_atomic ||
        receipt.success !== true || receipt.network !== arc.network || receipt.payer?.toLowerCase() !== getPilotBuyerAddress().toLowerCase() ||
        typeof receipt.transaction !== "string" || !receipt.transaction) throw new Error("Receipt mismatch");
    return new NextResponse(r.response.body, { status: 200, headers: { ...r.response.headers, ...headers,
      "x-radar-replayed": "true", "x-radar-replay-only": "true" } });
  } catch {
    return NextResponse.json({ error: "Original accepted receipt unavailable or conflicting. Supplemental replay stopped; no new payment attempted.",
      payment_attempted: false, retry_safe: false }, { status: 409, headers });
  }
}

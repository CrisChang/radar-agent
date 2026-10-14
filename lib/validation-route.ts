import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, verifyTypedData } from "viem";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress, assertDistinctPaymentParties } from "./arc";
import { approvalMessage, CAMPAIGN_ID, STAGES, plannedPayment, intentRequestId, dueTime } from "./validation-plan";
import { validationStore } from "./validation-store";
import { emptyReport, reconcileCampaign } from "./validation-reconcile";
import { authenticateBilling } from "./billing-auth";
import { withGateway, getResourceUrl } from "./x402";
import { billFromRecord } from "./billing";
import { paymentIdentity } from "./payment-store";
import { CAMPAIGN_AUTH_WINDOW_SECONDS } from "./validation-authorization";

import { replayAcceptedCampaign } from "./validation-replay";
import { handoffMessage } from "./validation-handoff";
import { controlMessage } from "./validation-messages";
const noStore = { "cache-control": "no-store" };
async function owner(body: Record<string, unknown>, message: string) {
  const timestamp = String(body.timestamp ?? ""), age = Date.now() / 1000 - Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || age < -30 || age > 300 || !/^0x[\da-f]{130}$/i.test(String(body.signature))) throw new Error("Owner signature expired or missing");
  if (!await verifyMessage({ address: getPilotBuyerAddress(), message, signature: body.signature as `0x${string}` })) throw new Error("Owner signature invalid");
}
export async function validationStatus() {
  try {
    const store = validationStore();
    if (!store) return NextResponse.json({ ...emptyReport(), storage_status: "unavailable" }, { status: 503, headers: noStore });
    const state = await store.state(), savedReport = await store.report();
    const report = savedReport ?? (state ? { ...emptyReport(), status: state.reservedCount ? "awaiting_reconciliation" : "stage_approved",
      attempted_payments: state.reservedCount, http_attempts: null,
      conclusion: "Stage approved. Live reservations are shown; no chain settlement is inferred before reconciliation." } : emptyReport());
    return NextResponse.json({ report, state, storage_status: "available" }, { headers: noStore });
  } catch { return NextResponse.json({ error: "Validation evidence temporarily unavailable; no success is inferred" }, { status: 503, headers: noStore }); }
}
export async function validationControl(request: NextRequest) {
  try {
    if (getArcConfig().mode !== "mainnet") throw new Error("Mainnet campaign only");
    assertDistinctPaymentParties(getPilotBuyerAddress(), getSellerAddress());
    if (Number(request.headers.get("content-length") ?? "0") > 4096) throw new Error("Oversized control request");
    const raw = await request.text(); if (raw.length > 4096) throw new Error("Oversized control request");
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = String(body.action), timestamp = String(body.timestamp);
    const origin = new URL(getResourceUrl(request)).origin;
    const stage = Number(body.stage);
    await owner(body, action === "approve" ? approvalMessage(origin, getPilotBuyerAddress(), getSellerAddress(), stage, timestamp) : action === "handoff" ? handoffMessage(origin, String(body.runnerId), String(body.bundleHash), Number(body.reservedCount), timestamp) : controlMessage(origin, action, timestamp));
    const store = validationStore(); if (!store) throw new Error("Durable campaign store unavailable");
    if (action === "handoff") {
      if (!await store.handoff(String(body.runnerId), String(body.bundleHash), Number(body.reservedCount))) return NextResponse.json({ error: "接管未完成：请停止网页运行，并只读核查全部已有付款；存在未决交易、过期预算或不同接管包时不能切换。" }, { status: 409, headers: noStore });
      return NextResponse.json({ state: await store.state(), payment_attempted: false }, { headers: noStore });
    }
    if (action === "approve") {
      if (process.env.RADAR_ACCEPT_PAYMENTS !== "true") throw new Error("Payments disabled");
      const terms = STAGES.find(s => s.stage === stage); if (!terms) throw new Error("Invalid stage");
      // Verify existing funds, without automatically depositing or approving tokens.
      const arc = getArcConfig();
      const response = await fetch(`${arc.facilitatorUrl}/v1/balances`, { method: "POST", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "USDC", sources: [{ depositor: getPilotBuyerAddress(), domain: 26 }] }) });
      const balance = await response.json() as { balances?: { balance?: string }[] };
      const available = balance.balances?.[0]?.balance;
      if (!response.ok || typeof available !== "string" || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(available)) throw new Error("Gateway balance unverified");
      const [whole, fraction = ""] = available.split(".");
      if (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0")) < BigInt(terms.amountAtomic)) throw new Error("Gateway balance insufficient for this stage; no automatic funding");
      if (!await store.approve(stage)) return NextResponse.json({ error: "Stage already approved, halted, or previous stage not fully reconciled" }, { status: 409, headers: noStore });
      return NextResponse.json({ state: await store.state(), payment_attempted: false }, { headers: noStore });
    }
    if (action === "resume") { await store.resume(); return NextResponse.json({ resumed: true }, { headers: noStore }); }
    if (action === "pause") { await store.pause(); return NextResponse.json({ paused: true }, { headers: noStore }); }
    const state = await store.state(); if (!state) throw new Error("Campaign not started");
    try { return NextResponse.json(await reconcileCampaign(store, state), { headers: noStore }); }
    catch {
      await store.halt("reconciliation_incomplete_or_discrepant");
      const latest = await store.state();
      if (latest) await store.publish(latest, { ...emptyReport(), status: "reconciliation_requires_review", overall_passed: null,
        attempted_payments: latest.reservedCount, generated_at: new Date().toISOString(),
        conclusion: "Reconciliation could not establish complete, consistent Gateway and chain evidence. New payments are halted; retry read-only reconciliation, not a new payment." }, 0, true);
      return NextResponse.json({ error: "Campaign reconciliation incomplete or discrepant. New payments halted; retry read-only reconciliation only." }, { status: 409, headers: noStore });
    }
  } catch (error) {
    // Never echo a signature or an upstream body into the UI or logs.
    const message = error instanceof Error ? error.message : "Campaign operation failed";
    const safe = /^(Owner signature|Stage|Gateway balance|Payments disabled|Mainnet campaign|Campaign not started|Invalid stage|Durable campaign)/.test(message);
    return NextResponse.json({ error: safe ? message : "Campaign control or reconciliation failed; no payment was attempted. Inspect evidence before continuing." }, { status: 400, headers: noStore });
  }
}
export async function validationPayment(request: NextRequest) {
  let row;
  const replayOnly = request.headers.has("x-radar-replay-only");
  try {
    if (getArcConfig().mode !== "mainnet" || [...request.nextUrl.searchParams.keys()].some(k => k !== "intent")) throw new Error("Invalid campaign endpoint");
    row = plannedPayment(request.nextUrl.searchParams.get("intent") ?? "");
    if (replayOnly && (request.headers.get("x-radar-replay-only") !== "true" || !request.headers.get("payment-signature") ||
        row.scenario !== "concurrent_same_authorization_replay")) throw new Error("Invalid replay-only request");
    if (request.headers.has("x-radar-request-id") && request.headers.get("x-radar-request-id") !== intentRequestId(row)) throw new Error("Intent request ID changed");
    if (request.headers.has("payment-signature") && request.headers.get("x-radar-request-id") !== intentRequestId(row)) throw new Error("Stable intent request ID required");
  } catch { return NextResponse.json({ error: "Use a frozen intent and its stable request ID; arbitrary prices are not accepted" }, { status: 400, headers: noStore }); }
  const store = validationStore(); if (!store) return NextResponse.json({ error: "Durable campaign store unavailable" }, { status: 503, headers: noStore });
  const paid = request.headers.get("payment-signature");
  const runnerId = request.headers.get("x-radar-runner-id") ?? "";
  const execution = await store.state();
  if (!replayOnly && ((execution?.executionMode === "local" && runnerId !== execution.runnerId) ||
      (execution?.executionMode !== "local" && runnerId !== ""))) {
    return NextResponse.json({ error: "执行端已切换；本入口禁止新付款。请使用已批准的本机接管包。", payment_attempted: false }, { status: 409, headers: noStore });
  }
  if (!paid && await store.intent(row.planned_intent_id)) return NextResponse.json({ error: "Intent already reserved; resume the original signed journal or reconcile, never create a replacement authorization" }, { status: 409, headers: noStore });
  if (!paid) {
    const state = await store.state();
    if (!state || state.halted || state.expiresAt < Date.now() || state.stage < row.stage || row.ordinal > state.maximumCount || dueTime(row, state.stage3StartedAt) > Date.now()) {
      return NextResponse.json({ error: "Campaign intent not approved, paused, expired or not yet due; do not sign a payment" }, { status: 409, headers: noStore });
    }
  }
  const attempt = randomUUID();
  let replayIdentity: ReturnType<typeof paymentIdentity> | undefined;
  if (paid) {
    try {
      if (paid.length > 16_384) throw new Error("Payload too large");
      const p = JSON.parse(Buffer.from(paid, "base64").toString("utf8"));
      const a = p.payload?.authorization;
      if (!a || a.from?.toLowerCase() !== getPilotBuyerAddress().toLowerCase() || a.to?.toLowerCase() !== getSellerAddress().toLowerCase() ||
          a.value !== row.amount_atomic || !/^\d+$/.test(a.validAfter) || !/^\d+$/.test(a.validBefore) || !/^0x[\da-f]{64}$/i.test(a.nonce) ||
          BigInt(a.validBefore) > BigInt(Math.floor(Date.now() / 1000) + CAMPAIGN_AUTH_WINDOW_SECONDS + 30)) throw new Error("Invalid campaign authorization");
      const arc = getArcConfig();
      if (!await verifyTypedData({ address: getPilotBuyerAddress(), domain: { name: "GatewayWalletBatched", version: "1", chainId: 5042, verifyingContract: arc.gatewayWallet },
        primaryType: "TransferWithAuthorization", types: { TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce }, signature: p.payload.signature })) throw new Error("Invalid campaign signature");
      const query = new URLSearchParams(request.nextUrl.searchParams); query.sort();
      const identity = paymentIdentity(p, arc.network, arc.gatewayWallet, intentRequestId(row), `${request.method}:${request.nextUrl.pathname}?${query.toString()}`);
      replayIdentity = identity;
      await store.appendEvent({ type: "attempt_started", paymentKey: identity.paymentKey, fingerprint: identity.fingerprint,
        ...(replayOnly ? { attemptKind: "settled_receipt_replay" } : {}),
        clientBootId: /^[a-f0-9-]{36}$/i.test(request.headers.get("x-radar-test-boot") ?? "") ? request.headers.get("x-radar-test-boot")! : undefined,
        clientAction: ["submit", "discard_response", "restore_after_restart"].includes(request.headers.get("x-radar-test-client-action") ?? "") ? request.headers.get("x-radar-test-client-action")! : undefined, at: new Date().toISOString(), intent: row.planned_intent_id, sessionId: /^[a-f0-9-]{36}$/i.test(request.headers.get("x-radar-test-session") ?? "") ? request.headers.get("x-radar-test-session")! : undefined, attemptId: attempt, requestId: intentRequestId(row) });
    } catch { return NextResponse.json({ error: "Invalid owner payment authorization; no settlement attempted" }, { status: 400, headers: noStore }); }
  }
  const handler = withGateway(async () => NextResponse.json({ campaign_id: CAMPAIGN_ID, intent: row.planned_intent_id,
    purpose: "owner_controlled_payment_reliability_test", amount_atomic: row.amount_atomic, scenario: row.scenario }, { headers: noStore }),
    row.amount_usdc, "/api/validation/payment", { store, campaign: { id: CAMPAIGN_ID, intent: row.planned_intent_id, ...(runnerId ? { runnerId } : {}) }, authorizationTimeoutSeconds: CAMPAIGN_AUTH_WINDOW_SECONDS });
  // A supplemental request can ONLY read an exact accepted receipt. There is
  // no fallback to the charging handler even if the original record is absent.
  const response = replayOnly ? await replayAcceptedCampaign(row, replayIdentity!, store) : await handler(request);
  if (paid) {
    try {
      let reason: string | undefined;
      if (response.status === 402) {
        const body = await response.clone().json() as { reason?: unknown };
        if (typeof body.reason === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(body.reason)) reason = body.reason;
      }
      await store.appendEvent({ type: "attempt_finished", at: new Date().toISOString(), intent: row.planned_intent_id,
      requestId: intentRequestId(row), attemptId: attempt, status: response.status,
      state: response.headers.get("x-radar-replayed") === "true" ? "replayed" : "observed_http_result", reason }); }
    catch { return NextResponse.json({ error: "Audit acknowledgement unknown; reconcile this intent without creating another authorization" }, { status: 503, headers: noStore }); }
  }
  response.headers.set("x-radar-attempt-id", attempt);
  response.headers.set("cache-control", "no-store");
  return response;
}
export async function validationExport(request: NextRequest) {
  try {
    const wallet = await authenticateBilling(request, getResourceUrl(request), getArcConfig().network);
    if (wallet !== getPilotBuyerAddress().toLowerCase()) return NextResponse.json({ error: "Campaign owner required" }, { status: 403, headers: noStore });
    const offsetText = request.nextUrl.searchParams.get("offset") ?? "0";
    const kind = request.nextUrl.searchParams.get("kind") ?? "receipts";
    if (!/^(0|[1-9]\d{0,5})$/.test(offsetText) || !["receipts", "events"].includes(kind) ||
        [...request.nextUrl.searchParams.keys()].some(k => !["offset", "kind"].includes(k))) throw new Error("Invalid export page");
    const offset = Number(offsetText), store = validationStore(); if (!store) throw new Error("Store unavailable");
    const records = kind === "receipts" ? await store.allRecords() : undefined;
    const page = records ? records.slice(offset, offset + 100).map(r => ({ ...billFromRecord(r),
      campaign: r.campaign, nonce: r.authorization?.nonce, fingerprint: r.fingerprint })) : await store.events(offset, 100);
    return NextResponse.json({ campaign_id: CAMPAIGN_ID, kind, offset, items: page,
      next_offset: records ? offset + page.length < records.length ? offset + page.length : null : page.length === 100 ? offset + 100 : null,
      note: "Private owner export. Contains attribution nonces, never payment signatures." }, { headers: noStore });
  } catch { return NextResponse.json({ error: "A valid wallet read signature and export page are required" }, { status: 401, headers: noStore }); }
}

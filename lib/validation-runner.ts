import { walletRejected } from "./wallet-rejection";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { getArcConfig } from "./arc";
import { validateOffer, assertUnchangedOffer } from "./agent-contract";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, intentRequestId, type PlannedPayment } from "./validation-plan";
import { CAMPAIGN_AUTH_WINDOW_SECONDS, type CampaignAuthorization } from "./validation-authorization";

export interface PrivateJournal {
  campaign: string; intent: string; requestId: string; amountAtomic: string; origin: string; payer: string; seller: string;
  state: "signature_rejected" | "signing" | "signed" | "submitted" | "restart_required" | "accepted" | "unknown" | "renewing";
  paymentHeader?: string; nonce?: string; bootId: string; responseHash?: string;
  pendingRenewal?: CampaignAuthorization;
  renewals?: { at: string; reason: string; originalPaymentHeader: string; renewedValidBefore: string }[];
  lastFailure?: { status: number; reason?: string };
  attempts: { at: string; status?: number; attemptId?: string; outcome: string }[];
}
type Signer = ConstructorParameters<typeof BatchEvmScheme>[0];
export interface RunnerDependencies {
  origin: string; payer: string; seller: string; bootId: string; sessionId?: string; signer: Signer; fetcher?: typeof fetch;
  load(id: string): Promise<PrivateJournal | null>; save(journal: PrivateJournal): Promise<void>;
}
function decode(value: string | null) {
  if (!value || value.length > 32_768) throw new Error("Missing payment protocol response");
  return JSON.parse(typeof Buffer === "undefined" ? atob(value) : Buffer.from(value, "base64").toString("utf8"));
}
function encode(value: unknown) {
  const raw = JSON.stringify(value);
  return typeof Buffer === "undefined" ? btoa(raw) : Buffer.from(raw).toString("base64");
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
/** Environment-neutral runner. It never deposits, grants token allowances,
 * changes an amount, or creates a replacement nonce after signing. */
export async function runPlannedPayment(row: PlannedPayment, deps: RunnerDependencies) {
  const arc = getArcConfig({ ARC_NETWORK: "mainnet" }), fetcher = deps.fetcher ?? fetch;
  const origin = new URL(deps.origin).origin;
  if (origin !== deps.origin || (new URL(origin).protocol !== "https:" && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) throw new Error("Pin an HTTPS origin");
  if (deps.signer.address.toLowerCase() !== deps.payer.toLowerCase() || deps.payer.toLowerCase() === deps.seller.toLowerCase()) throw new Error("Wrong payer signer or seller");
  const requestId = intentRequestId(row), url = `${origin}/api/validation/payment?intent=${row.planned_intent_id}`;
  let journal = await deps.load(row.planned_intent_id);
  if (journal && (journal.campaign !== CAMPAIGN_ID || journal.intent !== row.planned_intent_id || journal.requestId !== requestId ||
      journal.amountAtomic !== row.amount_atomic || journal.origin !== origin || journal.payer.toLowerCase() !== deps.payer.toLowerCase() ||
      journal.seller.toLowerCase() !== deps.seller.toLowerCase())) throw new Error("Private journal scope conflict");
  const rejectedAttempts = journal?.state === "signature_rejected" ? journal.attempts : [];
  if (journal?.state === "signature_rejected") journal = null;
  if (journal?.state === "accepted") return { state: "accepted" as const, journal };
  if (journal?.state === "renewing" || journal?.pendingRenewal) throw new Error("续签结果未确认；禁止提交旧授权或创建新付款，请保留记录并核查。");
  if (journal?.state === "restart_required" && journal.bootId === deps.bootId) return { state: "restart_required" as const, journal };
  if (journal && !journal.paymentHeader) throw new Error("Signing outcome unresolved. Do not create a replacement authorization");
  if (!journal) {
    const response = await fetcher(url, { headers: { "x-radar-request-id": requestId }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (response.status !== 402) throw new Error("Intent unavailable or already reserved; reconcile before signing");
    const raw = decode(response.headers.get("payment-required"));
    const offer = validateOffer(raw, arc, row.amount_atomic, CAMPAIGN_AUTH_WINDOW_SECONDS);
    if (offer.amountAtomic !== row.amount_atomic || offer.payTo.toLowerCase() !== deps.seller.toLowerCase() || raw.resource?.url !== url) throw new Error("Frozen quote changed");
    journal = { campaign: CAMPAIGN_ID, intent: row.planned_intent_id, requestId, amountAtomic: row.amount_atomic,
      origin, payer: deps.payer.toLowerCase(), seller: deps.seller.toLowerCase(), state: "signing", bootId: deps.bootId, attempts: rejectedAttempts };
    await deps.save(journal);
    const scheme = new BatchEvmScheme({ address: deps.signer.address, async signTypedData(params) {
      assertUnchangedOffer(raw.accepts[0], offer, arc, CAMPAIGN_AUTH_WINDOW_SECONDS);
      if (params.domain.chainId !== 5042 || params.domain.name !== "GatewayWalletBatched" || params.domain.version !== "1" ||
          params.domain.verifyingContract.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
          String(params.message.from).toLowerCase() !== deps.payer.toLowerCase() || String(params.message.to).toLowerCase() !== deps.seller.toLowerCase() ||
          BigInt(String(params.message.value)) !== BigInt(row.amount_atomic)) throw new Error("Signing terms differ from the frozen intent");
      return deps.signer.signTypedData(params);
    } });
    let payload: Awaited<ReturnType<BatchEvmScheme["createPaymentPayload"]>>;
    try { payload = await scheme.createPaymentPayload(2, raw.accepts[0]); }
    catch (error) {
      if (walletRejected(error)) {
        journal.state = "signature_rejected"; journal.attempts.push({ at: new Date().toISOString(), outcome: "wallet_rejected_before_signature" }); await deps.save(journal);
      }
      throw new Error(walletRejected(error) ? "Wallet rejected before a payment signature was returned; no payment submitted" : "Signing outcome unresolved. Do not create a replacement authorization");
    }
    journal.paymentHeader = encode({ ...payload, accepted: raw.accepts[0], resource: raw.resource });
    journal.nonce = (payload.payload as { authorization: { nonce: string } }).authorization.nonce;
    journal.state = "signed";
    await deps.save(journal); // MUST commit the exact authorization before the first HTTP submission.
  }
  const active = journal;
  let integrityFailure = false;
  async function submit(discard = false) {
    active.state = "submitted"; await deps.save(active);
    try {
      const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000),
        headers: { "x-radar-request-id": requestId, "payment-signature": active.paymentHeader!, "x-radar-test-session": deps.sessionId ?? deps.bootId, "x-radar-test-boot": deps.bootId,
          "x-radar-test-client-action": discard ? "discard_response" : row.scenario === "client_restart" && active.bootId !== deps.bootId ? "restore_after_restart" : "submit" } });
      active.attempts.push({ at: new Date().toISOString(), status: response.status,
        attemptId: response.headers.get("x-radar-attempt-id") ?? undefined, outcome: discard ? "controlled_response_discard" : "http_response" });
      await deps.save(active);
      if (discard) { await response.body?.cancel(); return null; }
      if (!response.ok) {
        let reason: string | undefined;
        try { const text = await response.text(); if (text.length <= 4096) { const body = JSON.parse(text); if (typeof body.reason === "string" && /^[a-z][a-z0-9_]{0,99}$/.test(body.reason)) reason = body.reason; } } catch { /* HTTP status still does not imply a settlement outcome. */ }
        active.lastFailure = { status: response.status, reason }; await deps.save(active); return null;
      }
      const body = await response.text(), hash = await digest(body), parsed = JSON.parse(body);
      const receipt = decode(response.headers.get("payment-response"));
      if (hash !== response.headers.get("x-radar-response-sha256") || parsed.campaign_id !== CAMPAIGN_ID ||
          parsed.intent !== row.planned_intent_id || parsed.amount_atomic !== row.amount_atomic || receipt.success !== true ||
          receipt.network !== arc.network || receipt.payer?.toLowerCase() !== deps.payer.toLowerCase() || typeof receipt.transaction !== "string" ||
          (active.responseHash && active.responseHash !== hash)) { integrityFailure = true; throw new Error("Receipt or exact response digest differs"); }
      active.responseHash = hash; await deps.save(active); return hash;
    } catch {
      active.attempts.push({ at: new Date().toISOString(), outcome: "transport_or_response_unknown" });
      active.state = "unknown"; await deps.save(active); return null;
    }
  }
  const firstAttempt = active.attempts.every(a => a.outcome === "wallet_rejected_before_signature");
  let result: string | null;
  if (row.scenario === "concurrent_same_authorization_replay") {
    const both = await Promise.all([submit(), submit()]); result = both.find(Boolean) ?? await submit();
  } else if (row.scenario === "response_loss_after_submit") {
    await submit(true); result = await submit();
  } else {
    result = await submit();
    if (row.scenario === "serial_same_authorization_replay" && result) result = await submit();
    if (row.scenario === "client_restart" && active.bootId === deps.bootId && result) {
      active.state = "restart_required"; active.bootId = deps.bootId; await deps.save(active);
      return { state: "restart_required" as const, journal: active };
    }
  }
  if (integrityFailure) result = null;
  active.state = result ? "accepted" : "unknown"; await deps.save(active);
  if (!result) throw new Error(active.lastFailure?.reason === "authorization_validity_too_short"
    ? "原授权剩余有效期不足，验证阶段已拒绝。请使用下方“核查并延长原授权”，保持同一 nonce；不要清空记录或签新付款。"
    : "Payment outcome unresolved. Stop new payments; reconcile or replay only this saved authorization");
  const spread = PAYMENT_SCHEDULE.filter(r => r.scenario === "spread_sessions");
  if (firstAttempt && row.scenario === "spread_sessions" && (spread.findIndex(r => r.planned_intent_id === row.planned_intent_id) + 1) % 20 === 0) {
    return { state: "session_checkpoint" as const, journal: active };
  }
  return { state: "accepted" as const, journal: active };
}

import { CAMPAIGN_ID, intentRequestId, type PlannedPayment } from "./validation-plan";
import { getArcConfig } from "./arc";
import { inspectCampaignPayment } from "./validation-authorization";
import type { PrivateJournal } from "./validation-runner";

interface ReplayDependencies {
  origin: string; payer: string; seller: string; bootId: string; fetcher?: typeof fetch;
  load(id: string): Promise<PrivateJournal | null>; save(journal: PrivateJournal): Promise<void>;
}
function decode(value: string | null) {
  if (!value || value.length > 16_384) throw new Error("Missing original payment record");
  return JSON.parse(typeof Buffer === "undefined" ? atob(value) : Buffer.from(value, "base64").toString("utf8"));
}
/** No signer dependency, unsigned quote, new nonce, funding or charging fallback. */
export async function supplementConcurrentReplay(row: PlannedPayment, deps: ReplayDependencies) {
  const origin = new URL(deps.origin).origin, journal = await deps.load(row.planned_intent_id);
  if (origin !== deps.origin || !origin.startsWith("https://") || deps.payer.toLowerCase() === deps.seller.toLowerCase() ||
      row.scenario !== "concurrent_same_authorization_replay") throw new Error("补测范围不符，已停止。");
  if (!journal || journal.state !== "accepted" || !journal.paymentHeader || !journal.nonce || !journal.responseHash || journal.pendingRenewal ||
      journal.campaign !== CAMPAIGN_ID || journal.intent !== row.planned_intent_id || journal.requestId !== intentRequestId(row) ||
      journal.origin !== origin || journal.amountAtomic !== row.amount_atomic || journal.payer.toLowerCase() !== deps.payer.toLowerCase() ||
      journal.seller.toLowerCase() !== deps.seller.toLowerCase()) throw new Error(`${row.planned_intent_id} 缺少本机原成功记录或范围不符。请回到原付款的 Chrome，不要清除数据或重新签付款。`);
  const a = inspectCampaignPayment(journal.paymentHeader, row, { arc: getArcConfig({ ARC_NETWORK: "mainnet" }), origin, payer: deps.payer, seller: deps.seller }).payload.authorization;
  if (!a || a.nonce !== journal.nonce || a.value !== row.amount_atomic || a.from?.toLowerCase() !== deps.payer.toLowerCase() ||
      a.to?.toLowerCase() !== deps.seller.toLowerCase()) throw new Error("原授权与本机账单不符，补测已停止。");
  const url = `${origin}/api/validation/payment?intent=${row.planned_intent_id}`, fetcher = deps.fetcher ?? fetch;
  const headers = { "payment-signature": journal.paymentHeader, "x-radar-request-id": journal.requestId,
    "x-radar-replay-only": "true", "x-radar-test-boot": deps.bootId, "x-radar-test-session": crypto.randomUUID() };
  const attempts: PrivateJournal["attempts"] = [];
  async function read() {
    let attempt: PrivateJournal["attempts"][number] = { at: new Date().toISOString(), outcome: "supplemental_replay_transport_unknown" };
    try {
      const response = await fetcher(url, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(45_000) });
      attempt = { at: new Date().toISOString(), status: response.status, attemptId: response.headers.get("x-radar-attempt-id") ?? undefined,
        outcome: "supplemental_replay_response_unverified" };
      if (response.status !== 200 || response.headers.get("x-radar-replay-only") !== "true" || response.headers.get("x-radar-replayed") !== "true" ||
          !attempt.attemptId) throw new Error("Replay not confirmed");
      const body = await response.text(), bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      const hash = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
      const parsed = JSON.parse(body), receipt = decode(response.headers.get("payment-response"));
      if (hash !== journal!.responseHash || hash !== response.headers.get("x-radar-response-sha256") ||
          response.headers.get("x-radar-request-id") !== journal!.requestId || parsed.campaign_id !== CAMPAIGN_ID ||
          parsed.intent !== row.planned_intent_id || parsed.amount_atomic !== row.amount_atomic || receipt.success !== true ||
          receipt.network !== "eip155:5042" || receipt.payer?.toLowerCase() !== deps.payer.toLowerCase() ||
          typeof receipt.transaction !== "string" || !receipt.transaction) throw new Error("Original response mismatch");
      attempt.outcome = "supplemental_replay_exact_response";
      return attempt.attemptId;
    } finally { attempts.push(attempt); }
  }
  // Start two real HTTP requests together; no artificial delay or overlap label.
  const results = await Promise.allSettled([read(), read()]);
  journal.attempts.push(...attempts); await deps.save(journal); // Never downgrade an already accepted payment.
  if (results.some(r => r.status === "rejected") ||
      new Set(results.flatMap(r => r.status === "fulfilled" ? [r.value] : [])).size !== 2) {
    throw new Error(`${row.planned_intent_id} 补测响应未全部核实。原成功付款保留，请先只读对账；不要重新付款。`);
  }
  return { responsesVerified: 2, overlapVerified: false as const }; // Only the server event reconciliation can prove overlap.
}

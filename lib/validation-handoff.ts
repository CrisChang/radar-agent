import { getArcConfig } from "./arc";
import { inspectCampaignPayment } from "./validation-authorization";
import { CAMPAIGN_ID, SCHEDULE_SHA256, PAYMENT_SCHEDULE, intentRequestId, plannedPayment } from "./validation-plan";
import type { PrivateJournal } from "./validation-runner";
export const RUNNER_ORIGIN = "https://radar-agent-ivory.vercel.app";
export const RUNNER_PAYER = "0xefc70a0dedefee6a010bac44de489bafb2fd8422";
export const RUNNER_SELLER = "0x1c19A9afa995B096Ea029723DF3C2AfA33c2957C";
export interface HandoffBundle {
  schema: "radar-local-handoff-v1"; campaign: string; scheduleSha256: string; origin: string; payer: string; seller: string;
  stage: 3; runnerId: string; reservedCount: number; createdAt: string; journals: PrivateJournal[];
}
export function validateHandoffBundle(b: HandoffBundle) {
  if (!b || b.schema !== "radar-local-handoff-v1" || b.campaign !== CAMPAIGN_ID || b.scheduleSha256 !== SCHEDULE_SHA256 ||
      b.origin !== RUNNER_ORIGIN || b.payer?.toLowerCase() !== RUNNER_PAYER || b.seller?.toLowerCase() !== RUNNER_SELLER.toLowerCase() ||
      b.stage !== 3 || !/^[a-f0-9-]{36}$/i.test(b.runnerId) || !Number.isInteger(b.reservedCount) || b.reservedCount < 100 || b.reservedCount > 1000 ||
      !Array.isArray(b.journals) || b.journals.length > 900 || !Number.isFinite(Date.parse(b.createdAt))) throw new Error("接管包范围或固定计划不符。");
  const ids = new Set<string>();
  for (const j of b.journals) {
    const row = plannedPayment(j.intent);
    if (ids.has(j.intent) || row.stage !== 3 || j.campaign !== b.campaign || j.requestId !== intentRequestId(row) || j.origin !== b.origin ||
        j.payer.toLowerCase() !== b.payer.toLowerCase() || j.seller.toLowerCase() !== b.seller.toLowerCase() || j.amountAtomic !== row.amount_atomic ||
        !Array.isArray(j.attempts) || j.pendingRenewal || ["signing", "renewing"].includes(j.state) ||
        !["unsigned_interrupted", "signature_rejected", "signed", "submitted", "restart_required", "accepted", "unknown"].includes(j.state)) throw new Error("原记录不完整或签名结果不确定；请保留原浏览器并核查。");
    ids.add(j.intent);
    if (["signature_rejected", "unsigned_interrupted"].includes(j.state) && (j.paymentHeader || j.nonce)) throw new Error("拒签记录包含付款授权，必须先核查。");
    if (j.paymentHeader) {
      const p = inspectCampaignPayment(j.paymentHeader, row, { arc: getArcConfig({ ARC_NETWORK: "mainnet" }), origin: b.origin, payer: b.payer, seller: b.seller });
      if (j.nonce !== p.payload.authorization.nonce) throw new Error("原 nonce 不一致。");
    } else if (!["signature_rejected", "unsigned_interrupted"].includes(j.state)) throw new Error("原付款签名缺失；不可用新签名替代。");
  }
  return b;
}
export function requireReservedJournals(b: HandoffBundle, rows: { intent: string; stage: number; local_state: string; response_sha256?: string | null }[]) {
  validateHandoffBundle(b);
  const reserved = rows.filter(row => row.stage === 3 && ["preparing", "settling", "accepted", "unknown", "rejected"].includes(row.local_state));
  if (reserved.length !== b.reservedCount - 100) throw new Error("对账快照与预留数量不一致，请先只读核查。");
  for (const row of reserved) {
    const j = b.journals.find(j => j.intent === row.intent);
    if (!j?.paymentHeader || row.local_state !== "accepted" ||
        (j.state === "accepted" && j.responseHash !== row.response_sha256)) throw new Error(`缺少 ${row.intent} 的原授权或成功账单，无法接管。`);
  }
  // A locally accepted entry must have matching independently reconciled evidence.
  for (const j of b.journals.filter(j => j.state === "accepted")) if (!reserved.some(row => row.intent === j.intent && row.response_sha256 === j.responseHash)) throw new Error("本机成功记录未在对账中核实。");
}
export async function handoffDigest(b: HandoffBundle) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(b)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function handoffMessage(origin: string, runnerId: string, bundleHash: string, count: number, timestamp: string) {
  if (origin !== RUNNER_ORIGIN || !/^[a-f0-9-]{36}$/i.test(runnerId) || !/^[a-f0-9]{64}$/.test(bundleHash) || !Number.isInteger(count) || count < 100 || count > 1000 || !/^\d{10}$/.test(timestamp)) throw new Error("Invalid handoff scope");
  return ["Radar Agent local runner handoff", `Origin: ${origin}`, `Campaign: ${CAMPAIGN_ID}`, `Schedule SHA-256: ${SCHEDULE_SHA256}`,
    "Network: eip155:5042", "Stage: 3", `Runner: ${runnerId}`, `Private bundle SHA-256: ${bundleHash}`, `Existing reserved payments: ${count}`,
    "Disable browser new payments; allow only this local runner to use the existing stage budget.",
    "No increase in amount, count, authorization lifetime or funding. No key or payment signatures are uploaded by this handoff.",
    `Issued at: ${timestamp}`, "Expires in: 300 seconds"].join("\n");
}
export const stageThreeRows = () => PAYMENT_SCHEDULE.filter(r => r.stage === 3);

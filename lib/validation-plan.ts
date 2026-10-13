import schedule from "../data/validation-schedule.json";

export const CAMPAIGN_ID = "arc-mainnet-reliability-1000-v1";
export const SCHEDULE_SHA256 = "1adde180d066de78188bdad2066463e0a56b00f17e55ffb752d03880c00ec779";
export const AMOUNT_TIERS = [1, 2, 5, 9, 10, 99, 100, 101, 999, 1000] as const;
export const STAGES = [
  { stage: 1, count: 10, cumulativeCount: 10, amountAtomic: "2326", cumulativeAtomic: "2326" },
  { stage: 2, count: 90, cumulativeCount: 100, amountAtomic: "20934", cumulativeAtomic: "23260" },
  { stage: 3, count: 900, cumulativeCount: 1000, amountAtomic: "209340", cumulativeAtomic: "232600" },
] as const;
export interface PlannedPayment {
  planned_intent_id: string; stage: number; ordinal: number; scenario: string;
  amount_atomic: string; amount_usdc: string; state: string;
}
export const PAYMENT_SCHEDULE: PlannedPayment[] = schedule;
export function plannedPayment(id: string): PlannedPayment {
  const row = PAYMENT_SCHEDULE.find(item => item.planned_intent_id === id);
  if (!row) throw new Error("Unknown frozen payment intent");
  return row;
}
export function intentRequestId(row: PlannedPayment): string {
  return `ac130026-1013-4000-8000-${String(row.ordinal).padStart(12, "0")}`;
}
export function formatAtomic(value: string | bigint): string {
  const n = BigInt(value), sign = n < 0n ? "-" : "", a = n < 0n ? -n : n;
  return `${sign}${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, "0")}`;
}
export function approvalMessage(origin: string, payer: string, seller: string, stage: number, issuedAt: string) {
  const terms = STAGES.find(s => s.stage === stage);
  if (!terms || !/^\d{10}$/.test(issuedAt)) throw new Error("Invalid stage approval");
  return ["Radar Agent mainnet reliability test approval", `Origin: ${new URL(origin).origin}`,
    `Campaign: ${CAMPAIGN_ID}`, `Schedule SHA-256: ${SCHEDULE_SHA256}`, "Network: eip155:5042",
    `Payer: ${payer.toLowerCase()}`, `Recipient: ${seller.toLowerCase()}`, `Stage: ${stage}`,
    `New payments: ${terms.count}`, `Stage USDC: ${formatAtomic(terms.amountAtomic)}`,
    `Cumulative payments cap: ${terms.cumulativeCount}`, `Cumulative USDC cap: ${formatAtomic(terms.cumulativeAtomic)}`,
    "Gas and deposits: NOT authorized by this signature", "Approval lifetime: 3 days; no automatic renewal",
    `Issued at: ${issuedAt}`, "Each payment still requires its own exact-amount Gateway authorization.",
    "Owner-controlled functional tests; not independent customer revenue."].join("\n");
}
export function dueTime(row: PlannedPayment, stage3StartedAt: number): number {
  return row.stage === 3 ? stage3StartedAt + Math.ceil((row.ordinal - 101) * 86_400_000 / 899) : 0;
}

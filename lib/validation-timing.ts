import { CAMPAIGN_ID, SCHEDULE_SHA256, PAYMENT_SCHEDULE, dueTime } from "./validation-plan";
import { RUNNER_ORIGIN } from "./validation-handoff";
export const FAST_INTERVAL_MS = 5000;
export interface TimingAmendment {
  mode: "accelerated-5s-v1"; fromOrdinal: number; activatedAt: number; intervalMs: 5000;
  originalStage3StartedAt: number; authorizationHash: string;
}
export interface TimingState { stage3StartedAt: number; timingAmendment?: TimingAmendment; lastClaimAt?: number }
export function validateTimingAmendment(a: TimingAmendment, startedAt: number) {
  if (!a || a.mode !== "accelerated-5s-v1" || a.intervalMs !== FAST_INTERVAL_MS ||
      !Number.isInteger(a.fromOrdinal) || a.fromOrdinal < 101 || a.fromOrdinal > 1000 ||
      !Number.isSafeInteger(a.activatedAt) || a.activatedAt < startedAt || a.originalStage3StartedAt !== startedAt ||
      !/^[a-f0-9]{64}$/.test(a.authorizationHash)) throw new Error("Invalid timing amendment");
  return a;
}
export function effectiveDueTime(row: typeof PAYMENT_SCHEDULE[number], state: TimingState, enforceSpacing = true) {
  const a = state.timingAmendment;
  if (!a) return dueTime(row, state.stage3StartedAt);
  validateTimingAmendment(a, state.stage3StartedAt);
  if (row.stage !== 3 || row.ordinal < a.fromOrdinal) return dueTime(row, state.stage3StartedAt);
  return Math.max(a.activatedAt + (row.ordinal - a.fromOrdinal + 1) * a.intervalMs,
    enforceSpacing && state.lastClaimAt ? state.lastClaimAt + a.intervalMs : 0);
}
export function accelerationMessage(origin: string, runnerId: string, bundleHash: string, count: number, timestamp: string) {
  if (origin !== RUNNER_ORIGIN || !/^[a-f0-9-]{36}$/i.test(runnerId) || !/^[a-f0-9]{64}$/.test(bundleHash) ||
      !Number.isInteger(count) || count < 100 || count >= 1000 || !/^\d{10}$/.test(timestamp)) throw new Error("Invalid timing amendment scope");
  return ["Radar Agent execution timing amendment v1", `Origin: ${origin}`, `Campaign: ${CAMPAIGN_ID}`,
    `Schedule SHA-256: ${SCHEDULE_SHA256}`, "Network: eip155:5042", `Runner: ${runnerId}`, `Private bundle SHA-256: ${bundleHash}`,
    `Existing reserved payments: ${count}`, `Accelerate only ordinals ${count + 1} through 1000.`,
    "Replace the remaining 24-hour timing slots with sequential execution, at least 5 seconds between new claims.",
    "Keep all original intents, amounts, nonces, receipts, failures and retry rules. One unresolved payment stops new claims.",
    "Stage 3 cap: 900 payments / 0.209340 USDC. Campaign cap: 1000 payments / 0.232600 USDC.",
    "No increase in budget or expiry. No deposit, token approval or withdrawal. This message itself makes no payment.",
    "Publish the timing amendment; do not claim that the original 24-hour plan was completed.",
    `Issued at: ${timestamp}`, "Expires in: 300 seconds"].join("\n");
}
export function timingEvidence(state: TimingState, claims: { ordinal: number; at: number }[]) {
  if (state.timingAmendment) validateTimingAmendment(state.timingAmendment, state.stage3StartedAt);
  const stage3 = claims.filter(c => c.ordinal >= 101).sort((a,b) => a.at - b.at);
  const first = stage3[0]?.at, last = stage3.at(-1)?.at;
  const scheduleRespected = stage3.every((c,i) => {
    const row = PAYMENT_SCHEDULE[c.ordinal - 1];
    if (!row || !Number.isFinite(c.at) || c.at < effectiveDueTime(row, state, false)) return false;
    return !state.timingAmendment || c.ordinal < state.timingAmendment.fromOrdinal || i === 0 || c.at - stage3[i-1].at >= FAST_INTERVAL_MS;
  });
  const duration = first === undefined || last === undefined ? null : last - first;
  return { mode: state.timingAmendment?.mode ?? "original-24h", amendment: state.timingAmendment ?? null,
    original_24h_plan_followed: state.timingAmendment ? false : null,
    stage3_first_claim_at: first === undefined ? null : new Date(first).toISOString(),
    stage3_last_claim_at: last === undefined ? null : new Date(last).toISOString(),
    stage3_observed_duration_hours: duration === null ? null : duration / 3_600_000,
    stage3_schedule_elapsed_hours: last === undefined ? null : (last - state.stage3StartedAt) / 3_600_000,
    schedule_respected: scheduleRespected,
    eligible_for_completion: scheduleRespected && (state.timingAmendment ? true : last !== undefined && last - state.stage3StartedAt >= 86_400_000) };
}

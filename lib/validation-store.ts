import { createHash } from "node:crypto";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "./arc";
import { RedisPaymentStore, paymentStoreConfigured } from "./redis-payment-store";
import type { PaymentRecord, PaymentState, SavedResponse } from "./payment-store";
import { CAMPAIGN_ID, SCHEDULE_SHA256, PAYMENT_SCHEDULE, STAGES, plannedPayment, intentRequestId, dueTime } from "./validation-plan";

export interface CampaignState {
  stage: number; maximumCount: number; maximumAtomic: string; reservedCount: number; reservedAtomic: string;
  expiresAt: number; startedAt: number; stage3StartedAt: number; halted: boolean;
  verifiedCount: number; reportRevision: number; executionMode?: "local"; runnerId?: string; bundleHash?: string; handoffCount?: number; ownerPaused?: boolean; haltReason?: string;
}
export interface CampaignEvent {
  type: string; at: string; intent?: string; requestId?: string; attemptId?: string; attemptKind?: "settled_receipt_replay";
  status?: number; state?: string; sessionId?: string; clientBootId?: string; clientAction?: string; paymentKey?: string; fingerprint?: string; amountAtomic?: string; reason?: string;
}
const CLAIM = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 or redis.call('EXISTS', KEYS[6]) == 1 then return 0 end
local raw = redis.call('GET', KEYS[4]); if not raw then return 0 end
local s = cjson.decode(raw)
if (s.executionMode == 'local' and s.runnerId ~= ARGV[9]) or (s.executionMode ~= 'local' and ARGV[9] ~= '') then return 0 end
if s.halted or s.expiresAt < tonumber(ARGV[3]) or s.stage < tonumber(ARGV[4]) or tonumber(ARGV[5]) > s.maximumCount then return 0 end
if redis.call('SCARD', KEYS[7]) > 0 then return 0 end
if tonumber(ARGV[4]) == 3 and tonumber(ARGV[3]) < s.stage3StartedAt + tonumber(ARGV[7]) then return 0 end
if s.reservedCount + 1 > s.maximumCount or tonumber(s.reservedAtomic) + tonumber(ARGV[6]) > tonumber(s.maximumAtomic) then return 0 end
s.reservedCount = s.reservedCount + 1; s.reservedAtomic = tostring(tonumber(s.reservedAtomic) + tonumber(ARGV[6]))
redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[2], ARGV[2]); redis.call('SET', KEYS[6], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2]); redis.call('SET', KEYS[4], cjson.encode(s))
redis.call('SADD', KEYS[7], ARGV[2]); redis.call('RPUSH', KEYS[5], ARGV[8]); return 1`;
const TRANSITION = `
local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
local r = cjson.decode(raw); if r.state ~= ARGV[1] then return 0 end
r.state = ARGV[2]; r.updatedAt = ARGV[3]; if ARGV[4] ~= '' then r.response = cjson.decode(ARGV[4]) end
redis.call('SET', KEYS[1], cjson.encode(r)); redis.call('RPUSH', KEYS[3], ARGV[5])
if ARGV[2] == 'accepted' or ARGV[2] == 'rejected' then redis.call('SREM', KEYS[4], ARGV[6]) end
if ARGV[2] == 'unknown' or ARGV[2] == 'rejected' then
 local s = cjson.decode(redis.call('GET', KEYS[2])); s.halted = true; redis.call('SET', KEYS[2], cjson.encode(s))
end
return 1`;
const APPROVE = `
local raw = redis.call('GET', KEYS[1]); local next = cjson.decode(ARGV[1])
if raw then
 local s = cjson.decode(raw)
 if s.halted or next.stage ~= s.stage + 1 or s.verifiedCount ~= s.maximumCount then return 0 end
 next.startedAt = s.startedAt; next.reservedCount = s.reservedCount; next.reservedAtomic = s.reservedAtomic
 next.verifiedCount = s.verifiedCount; next.reportRevision = s.reportRevision
elseif next.stage ~= 1 then return 0 end
redis.call('SET', KEYS[1], cjson.encode(next)); redis.call('RPUSH', KEYS[2], ARGV[2]); return 1`;
const PUBLISH = `
local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
local s = cjson.decode(raw)
if s.reservedCount ~= tonumber(ARGV[1]) or s.reportRevision ~= tonumber(ARGV[2]) then return 0 end
s.reportRevision = s.reportRevision + 1; s.verifiedCount = tonumber(ARGV[3])
if ARGV[4] == '1' then s.halted = true elseif s.verifiedCount == s.reservedCount and not s.ownerPaused then s.halted = false end
redis.call('SET', KEYS[1], cjson.encode(s)); redis.call('SET', KEYS[2], ARGV[5]); redis.call('RPUSH', KEYS[3], ARGV[6]); return 1`;

/** Shares nonce/request indexes with production. Only this class can claim
 * campaign intents, under an atomic owner-signed stage budget. Never removes
 * reservations on failures. The ordinary pilot cap is not changed. */
export class ValidationStore extends RedisPaymentStore {
  constructor(...args: ConstructorParameters<typeof RedisPaymentStore>) {
    super(...args);
    if (createHash("sha256").update(PAYMENT_SCHEDULE.map(row => JSON.stringify(row)).join("\n") + "\n").digest("hex") !== SCHEDULE_SHA256) throw new Error("Runtime schedule differs from frozen approval hash");
  }
  campaignKey(kind: string) { return this.key(`validation:${CAMPAIGN_ID}`, kind); }
  async state(): Promise<CampaignState | null> {
    const raw = await this.command(["GET", this.campaignKey("state")]);
    if (raw === null) return null;
    if (typeof raw !== "string") throw new Error("Invalid campaign state");
    return JSON.parse(raw) as CampaignState;
  }
  async intent(id: string): Promise<PaymentRecord | null> {
    plannedPayment(id);
    const key = await this.command(["GET", this.campaignKey(`intent:${id}`)]);
    if (key === null) return null;
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid intent index");
    const record = this.record(await this.command(["GET", this.key("payment", key)]));
    if (!record || record.campaign?.intent !== id) throw new Error("Missing intent receipt");
    return record;
  }
  async handoff(runnerId: string, bundleHash: string, reservedCount: number) {
    if (!/^[a-f0-9-]{36}$/i.test(runnerId) || !/^[a-f0-9]{64}$/.test(bundleHash) || !Number.isInteger(reservedCount) || reservedCount < 100 || reservedCount > 1000) throw new Error("Invalid handoff");
    const result = await this.command(["EVAL", `
      local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
      local s = cjson.decode(raw)
      if s.executionMode == 'local' then
        if s.runnerId == ARGV[1] and s.bundleHash == ARGV[2] and s.handoffCount == tonumber(ARGV[3]) then return 1 end
        return 0
      end
      if s.stage ~= 3 or s.halted or s.expiresAt <= tonumber(ARGV[4]) or s.reservedCount ~= tonumber(ARGV[3]) or redis.call('SCARD', KEYS[3]) ~= 0 then return 0 end
      local reportRaw = redis.call('GET', KEYS[4]); if not reportRaw then return 0 end
      local report = cjson.decode(reportRaw)
      if report.completed_payments ~= s.reservedCount or report.money_difference_atomic ~= '0' then return 0 end
      s.executionMode = 'local'; s.runnerId = ARGV[1]; s.bundleHash = ARGV[2]; s.handoffCount = s.reservedCount
      redis.call('SET', KEYS[1], cjson.encode(s)); redis.call('RPUSH', KEYS[2], ARGV[5]); return 1`,
      4, this.campaignKey("state"), this.campaignKey("events"), this.campaignKey("inflight"), this.campaignKey("report"),
      runnerId, bundleHash, reservedCount, Date.now(), JSON.stringify({ type: "local_runner_handoff", at: new Date().toISOString(), runnerId, bundleHash, reservedCount })]);
    return result === 1;
  }
  async pause() {
    const result = await this.command(["EVAL", `local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
      local s = cjson.decode(raw); s.halted = true; s.ownerPaused = true; redis.call('SET', KEYS[1], cjson.encode(s));
      redis.call('RPUSH', KEYS[2], ARGV[1]); return 1`, 2, this.campaignKey("state"), this.campaignKey("events"),
      JSON.stringify({ type: "owner_paused", at: new Date().toISOString() })]);
    if (result !== 1) throw new Error("Campaign not started");
  }
  async approve(stage: number, now = Date.now()): Promise<boolean> {
    const terms = STAGES.find(s => s.stage === stage); if (!terms) throw new Error("Invalid stage");
    const state: CampaignState = { stage, maximumCount: terms.cumulativeCount, maximumAtomic: terms.cumulativeAtomic,
      reservedCount: 0, reservedAtomic: "0", expiresAt: now + 3 * 86_400_000, startedAt: now,
      stage3StartedAt: stage === 3 ? now : 0, halted: false, verifiedCount: 0, reportRevision: 0 };
    return await this.command(["EVAL", APPROVE, 2, this.campaignKey("state"), this.campaignKey("events"),
      JSON.stringify(state), JSON.stringify({ type: "stage_approved", stage, scheduleSha256: SCHEDULE_SHA256,
        maximumAtomic: state.maximumAtomic, at: new Date(now).toISOString() })]) === 1;
  }
  override async claim(input: PaymentRecord): Promise<boolean> {
    const meta = input.campaign;
    if (!meta || meta.id !== CAMPAIGN_ID || !input.authorization || !input.terms) throw new Error("Campaign claim metadata required");
    const row = plannedPayment(meta.intent);
    const arc = getArcConfig();
    if (arc.mode !== "mainnet" || input.state !== "preparing" || input.requestId !== intentRequestId(row) ||
        input.authorization.network !== arc.network || input.authorization.gatewayWallet.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
        input.authorization.payer.toLowerCase() !== getPilotBuyerAddress().toLowerCase() ||
        input.terms.payTo.toLowerCase() !== getSellerAddress().toLowerCase() || input.terms.asset.toLowerCase() !== arc.usdc.toLowerCase() ||
        input.terms.amountAtomic !== row.amount_atomic || !/^[a-f0-9]{64}$/.test(input.paymentKey) || !/^[a-f0-9]{64}$/.test(input.requestKey)) throw new Error("Campaign terms conflict");
    const now = Date.now(), record = { ...input, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
    const result = await this.command(["EVAL", CLAIM, 7, this.key("payment", input.paymentKey), this.key("request", input.requestKey),
      this.key("payer", input.authorization.payer.toLowerCase()), this.campaignKey("state"), this.campaignKey("events"),
      this.campaignKey(`intent:${row.planned_intent_id}`), this.campaignKey("inflight"), JSON.stringify(record), input.paymentKey,
      now, row.stage, row.ordinal, row.amount_atomic, dueTime(row, 0), JSON.stringify({ type: "claimed", at: record.createdAt,
        intent: row.planned_intent_id, requestId: input.requestId, amountAtomic: row.amount_atomic }), meta.runnerId ?? ""]);
    if (result !== 0 && result !== 1) throw new Error("Invalid campaign claim acknowledgement");
    return result === 1;
  }
  override async transition(paymentKey: string, from: PaymentState, to: PaymentState, response?: SavedResponse) {
    const allowed: Record<PaymentState, PaymentState[]> = { preparing: ["settling", "rejected"], settling: ["accepted", "unknown"], accepted: [], rejected: [], unknown: [] };
    if (!allowed[from].includes(to)) throw new Error("Invalid campaign transition");
    const at = new Date().toISOString();
    if (await this.command(["EVAL", TRANSITION, 4, this.key("payment", paymentKey), this.campaignKey("state"),
      this.campaignKey("events"), this.campaignKey("inflight"), from, to, at, response ? JSON.stringify(response) : "",
      JSON.stringify({ type: "transition", at, paymentKey, state: to }), paymentKey]) !== 1) throw new Error("Campaign state conflict");
  }
  async resume() {
    if (await this.command(["EVAL", `local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
      local s = cjson.decode(raw); if s.verifiedCount ~= s.reservedCount or s.expiresAt < tonumber(ARGV[1]) then return 0 end
      s.halted = false; s.ownerPaused = false; redis.call('SET', KEYS[1], cjson.encode(s));
      redis.call('RPUSH', KEYS[2], ARGV[2]); return 1`, 2, this.campaignKey("state"), this.campaignKey("events"), Date.now(),
      JSON.stringify({ type: "owner_resumed", at: new Date().toISOString() })]) !== 1) throw new Error("Stage must be fully reconciled and unexpired before resume");
  }
  async halt(reason: string) {
    await this.command(["EVAL", `local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
      local s = cjson.decode(raw); s.halted = true; s.haltReason = ARGV[1]; redis.call('SET', KEYS[1], cjson.encode(s));
      redis.call('RPUSH', KEYS[2], ARGV[2]); return 1`, 2, this.campaignKey("state"), this.campaignKey("events"), reason,
      JSON.stringify({ type: "halted", at: new Date().toISOString(), reason })]);
  }
  async recoverPrepared(record: PaymentRecord, transferId: string) {
    if (!["settling", "unknown"].includes(record.state) || !record.response || !/^[a-f0-9-]{36}$/i.test(transferId)) throw new Error("Prepared response cannot be recovered");
    const response = { ...record.response, headers: { ...record.response.headers, "cache-control": "no-store",
      "x-radar-request-id": record.requestId,
      "x-radar-response-sha256": createHash("sha256").update(record.response.body).digest("hex"),
      "x-radar-payment-state": "gateway_accepted_chain_aggregate_verified",
      "payment-response": Buffer.from(JSON.stringify({ success: true, transaction: transferId, network: record.authorization!.network, payer: record.authorization!.payer })).toString("base64") } };
    const at = new Date().toISOString();
    if (await this.command(["EVAL", `local raw = redis.call('GET', KEYS[1]); if not raw then return 0 end
      local r = cjson.decode(raw); if r.state ~= ARGV[1] then return 0 end
      r.state = 'accepted'; r.response = cjson.decode(ARGV[2]); r.updatedAt = ARGV[3];
      redis.call('SET', KEYS[1], cjson.encode(r)); redis.call('SREM', KEYS[2], ARGV[4]); redis.call('RPUSH', KEYS[3], ARGV[5]); return 1`,
      3, this.key("payment", record.paymentKey), this.campaignKey("inflight"), this.campaignKey("events"), record.state,
      JSON.stringify(response), at, record.paymentKey, JSON.stringify({ type: "reconciled_accepted", at, intent: record.campaign!.intent })]) !== 1) throw new Error("Recovery state changed");
  }
  async appendEvent(event: CampaignEvent) {
    if (!/^[a-z_]{1,50}$/.test(event.type) || JSON.stringify(event).length > 2048) throw new Error("Invalid campaign event");
    await this.command(["RPUSH", this.campaignKey("events"), JSON.stringify(event)]);
  }
  async events(offset: number, limit: number): Promise<unknown[]> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid event page");
    const raw = await this.command(["LRANGE", this.campaignKey("events"), offset, offset + limit - 1]);
    if (!Array.isArray(raw) || raw.some(x => typeof x !== "string")) throw new Error("Invalid event log");
    return raw.map(x => JSON.parse(x));
  }
  async allRecords(): Promise<PaymentRecord[]> {
    const all: PaymentRecord[] = [];
    // Intent keys, not a newest-100 billing query. MGET chunks stay within Redis limits.
    for (let start = 0; start < 1000; start += 100) {
      const ids = Array.from({ length: 100 }, (_, n) => `planned-${String(start + n + 1).padStart(4, "0")}`);
      const keys = await this.command(["MGET", ...ids.map(id => this.campaignKey(`intent:${id}`))]);
      if (!Array.isArray(keys) || keys.length !== 100) throw new Error("Incomplete campaign index");
      const found = keys.filter((k): k is string => typeof k === "string");
      if (found.some(k => !/^[a-f0-9]{64}$/.test(k))) throw new Error("Invalid campaign index");
      if (!found.length) continue;
      const raw = await this.command(["MGET", ...found.map(k => this.key("payment", k))]);
      if (!Array.isArray(raw) || raw.length !== found.length) throw new Error("Incomplete campaign receipts");
      for (const value of raw) {
        const item = this.record(value);
        if (!item || item.campaign?.id !== CAMPAIGN_ID || item.authorization?.payer !== getPilotBuyerAddress().toLowerCase()) throw new Error("Campaign receipt scope conflict");
        all.push(item);
      }
    }
    return all;
  }
  async report(): Promise<Record<string, unknown> | null> {
    const raw = await this.command(["GET", this.campaignKey("report")]);
    if (raw === null) return null;
    if (typeof raw !== "string") throw new Error("Invalid campaign report");
    return JSON.parse(raw);
  }
  async publish(state: CampaignState, report: Record<string, unknown>, verified: number, halt: boolean) {
    const raw = JSON.stringify(report);
    const digest = createHash("sha256").update(raw).digest("hex");
    return await this.command(["EVAL", PUBLISH, 3, this.campaignKey("state"), this.campaignKey("report"), this.campaignKey("events"),
      state.reservedCount, state.reportRevision, verified, halt ? "1" : "0", raw,
      JSON.stringify({ type: "reconciled", at: new Date().toISOString(), sha256: digest, verifiedCount: verified })]) === 1;
  }
}
export function validationStore(): ValidationStore | undefined {
  if (!paymentStoreConfigured()) return undefined;
  const arc = getArcConfig();
  return new ValidationStore({ url: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
    token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
    namespace: process.env.RADAR_PAYMENT_NAMESPACE ?? `radar:v1:${arc.chainId}:${getSellerAddress().toLowerCase()}` });
}

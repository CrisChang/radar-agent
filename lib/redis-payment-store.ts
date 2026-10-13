import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "./arc";
import type { BillingStore, PaymentRecord, PaymentState, SavedResponse } from "./payment-store";

const CLAIM = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
if ARGV[4] == '1' then
  if redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
  if redis.call('ZCARD', KEYS[3]) > 100 then return 0 end
  for _, prior in ipairs(redis.call('ZRANGE', KEYS[3], 0, -1)) do
    local raw = redis.call('GET', ARGV[5] .. prior)
    if not raw then return 0 end
    if cjson.decode(raw).state ~= 'rejected' then
      redis.call('SET', KEYS[4], prior)
      return 0
    end
  end
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
if ARGV[4] == '1' then redis.call('SET', KEYS[4], ARGV[2]) end
return 1`;
const TRANSITION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
if record.state ~= ARGV[1] then return 0 end
record.state = ARGV[2]
record.updatedAt = ARGV[3]
if ARGV[4] ~= '' then record.response = cjson.decode(ARGV[4]) end
redis.call('SET', KEYS[1], cjson.encode(record))
if ARGV[2] == 'rejected' and redis.call('GET', KEYS[2]) == ARGV[5] then redis.call('DEL', KEYS[2]) end
return 1`;
const ALLOWED: Record<PaymentState, PaymentState[]> = {
  preparing: ["settling", "rejected"], settling: ["accepted", "unknown"],
  accepted: [], unknown: [], rejected: [],
};

/** Persistent Upstash Redis; claims and state changes execute atomically on
 * the primary. No TTL, signature, or reusable payment payload is stored.
 * Database eviction must remain disabled. A missing store never falls back
 * to function memory or the ephemeral Vercel filesystem.
 */
export class RedisPaymentStore implements BillingStore {
  private readonly base: URL;
  private readonly prefix: string;
  constructor(private readonly options: {
    url: string; token: string; namespace: string; fetcher?: typeof fetch; allowLoopback?: boolean; pilotPayer?: string; pilotPayTo?: string;
  }) {
    this.base = new URL(options.url);
    const loopback = options.allowLoopback && !process.env.VERCEL &&
      this.base.protocol === "http:" && ["127.0.0.1", "localhost"].includes(this.base.hostname);
    if ((!loopback && (this.base.protocol !== "https:" || !this.base.hostname.endsWith(".upstash.io"))) ||
        this.base.username || this.base.password || this.base.search || this.base.hash || this.base.pathname !== "/" ||
        !options.token || !/^[a-zA-Z0-9:_-]{1,160}$/.test(options.namespace) ||
        (options.pilotPayer !== undefined && !/^0x[\da-fA-F]{40}$/.test(options.pilotPayer)) ||
        (options.pilotPayTo !== undefined && (!options.pilotPayer || !/^0x[\da-fA-F]{40}$/.test(options.pilotPayTo)))) {
      throw new Error("Invalid durable payment store configuration");
    }
    this.prefix = `{${options.namespace}}:`;
  }
  protected key(kind: string, value: string): string { return `${this.prefix}${kind}:${value}`; }
  private pilotKey(): string { return this.key("pilot-cap", this.options.pilotPayer?.toLowerCase() ?? "unused"); }
  protected async command(args: (string | number)[]): Promise<unknown> {
    const result = await (this.options.fetcher ?? fetch)(this.base, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${this.options.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!result.ok) throw new Error("Durable payment store request failed");
    const text = await result.text();
    if (text.length > 8_388_608) throw new Error("Durable payment store response exceeds limit");
    const data = JSON.parse(text) as { result?: unknown; error?: unknown };
    if (data.error || !("result" in data)) throw new Error("Durable payment store command failed");
    return data.result;
  }
  protected record(raw: unknown): PaymentRecord | null {
    if (raw === null) return null;
    if (typeof raw !== "string") throw new Error("Invalid durable receipt");
    const record = JSON.parse(raw) as PaymentRecord;
    if (!record || !/^[a-f0-9]{64}$/.test(record.paymentKey) || !record.requestId || !(record.state in ALLOWED)) {
      throw new Error("Invalid durable receipt");
    }
    return record;
  }
  async find(paymentKey: string, requestKey: string): Promise<PaymentRecord | null> {
    const record = this.record(await this.command(["GET", this.key("payment", paymentKey)]));
    return record ?? this.findByRequest(requestKey);
  }
  async findByRequest(requestKey: string): Promise<PaymentRecord | null> {
    const paymentKey = await this.command(["GET", this.key("request", requestKey)]);
    if (paymentKey === null) return null;
    if (typeof paymentKey !== "string" || !/^[a-f0-9]{64}$/.test(paymentKey)) throw new Error("Invalid request index");
    const record = this.record(await this.command(["GET", this.key("payment", paymentKey)]));
    if (!record) throw new Error("Receipt index requires reconciliation");
    return record;
  }
  async claim(input: PaymentRecord): Promise<boolean> {
    if (input.state !== "preparing" || !input.authorization || !/^[a-f0-9]{64}$/.test(input.paymentKey) ||
        !/^[a-f0-9]{64}$/.test(input.requestKey)) throw new Error("Invalid payment claim");
    const now = new Date().toISOString();
    const record = { ...input, createdAt: now, updatedAt: now };
    const capped = this.options.pilotPayer?.toLowerCase() === input.authorization.payer.toLowerCase();
    if (capped && (input.terms?.amountAtomic !== "1000" || input.terms.payTo.toLowerCase() !== (this.options.pilotPayTo ?? this.options.pilotPayer)?.toLowerCase())) throw new Error("Pilot requires exactly one 0.001 USDC payment to its approved recipient.");
    const result = await this.command(["EVAL", CLAIM, 4, this.key("payment", input.paymentKey),
      this.key("request", input.requestKey), this.key("payer", input.authorization.payer.toLowerCase()), this.pilotKey(),
      JSON.stringify(record), input.paymentKey, Date.parse(now), capped ? "1" : "0", this.key("payment", "")]);
    if (result !== 0 && result !== 1) throw new Error("Invalid payment claim acknowledgement");
    return result === 1;
  }
  async transition(paymentKey: string, from: PaymentState, to: PaymentState, response?: SavedResponse): Promise<void> {
    if (!ALLOWED[from].includes(to)) throw new Error("Invalid payment transition");
    const result = await this.command(["EVAL", TRANSITION, 2, this.key("payment", paymentKey), this.pilotKey(), from, to,
      new Date().toISOString(), response ? JSON.stringify(response) : "", paymentKey]);
    if (result !== 1) throw new Error("Payment state conflict or missing claim");
  }
  async listForPayer(payer: string, limit: number): Promise<PaymentRecord[]> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(payer) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Invalid billing query");
    }
    const keys = await this.command(["ZREVRANGE", this.key("payer", payer.toLowerCase()), 0, limit - 1]);
    if (!Array.isArray(keys)) throw new Error("Invalid billing index");
    if (!keys.length) return [];
    if (keys.some(k => typeof k !== "string" || !/^[a-f0-9]{64}$/.test(k))) throw new Error("Invalid billing index");
    const raw = await this.command(["MGET", ...keys.map(k => this.key("payment", String(k)))]);
    if (!Array.isArray(raw) || raw.length !== keys.length) throw new Error("Incomplete billing query");
    return raw.map(value => {
      const record = this.record(value);
      if (!record || record.authorization?.payer.toLowerCase() !== payer.toLowerCase()) throw new Error("Billing index requires reconciliation");
      return record;
    });
  }
  async ping(): Promise<void> {
    if (await this.command(["PING"]) !== "PONG") throw new Error("Durable payment store unavailable");
  }
}

export function paymentStoreConfigured(): boolean {
  return Boolean((process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN));
}
export function currentPaymentStore(): RedisPaymentStore | undefined {
  if (!paymentStoreConfigured()) return undefined;
  const arc = getArcConfig();
  return new RedisPaymentStore({
    url: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
    token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
    namespace: process.env.RADAR_PAYMENT_NAMESPACE ?? `radar:v1:${arc.chainId}:${getSellerAddress().toLowerCase()}`,
    ...(arc.mode === "mainnet" ? { pilotPayer: getPilotBuyerAddress(), pilotPayTo: getSellerAddress() } : {}),
  });
}

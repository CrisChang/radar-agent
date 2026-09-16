import { createHash } from "node:crypto";

interface SqlConnection {
  prepare(sql: string): {
    bind(...values: (string | number | null)[]): {
      run(): Promise<{ success: boolean; meta: { changes: number } }>;
      first<T>(): Promise<T | null>;
    };
  };
}
export interface PaymentDatabase extends SqlConnection { withSession(constraint: "first-primary"): SqlConnection }
export type PaymentState = "preparing" | "settling" | "accepted" | "unknown" | "rejected";
export interface SavedResponse { status: number; body: string; headers: Record<string, string> }
export interface PaymentRecord {
  paymentKey: string;
  requestKey: string;
  fingerprint: string;
  requestId: string;
  state: PaymentState;
  authorization?: { payer: string; nonce: string; network: string; gatewayWallet: string };
  terms?: { amountAtomic: string; asset: string; payTo: string };
  response?: SavedResponse;
}
export interface PaymentStore {
  find(paymentKey: string, requestKey: string): Promise<PaymentRecord | null>;
  claim(record: PaymentRecord): Promise<boolean>;
  transition(paymentKey: string, from: PaymentState, to: PaymentState, response?: SavedResponse): Promise<void>;
}

/** D1 writes and compare-and-set transitions are individual atomic SQL statements.
 * No payment authorization or signature is persisted. Use a primary-first session.
 */
export class D1PaymentStore implements PaymentStore {
  private readonly db: SqlConnection;
  constructor(database: PaymentDatabase) { this.db = database.withSession("first-primary"); }
  async find(paymentKey: string, requestKey: string): Promise<PaymentRecord | null> {
    const row = await this.db.prepare(
      "SELECT record_json FROM payment_receipts WHERE payment_key = ?1 OR request_key = ?2 ORDER BY created_at LIMIT 1",
    ).bind(paymentKey, requestKey).first<{ record_json: string }>();
    return row ? JSON.parse(row.record_json) as PaymentRecord : null;
  }
  async claim(record: PaymentRecord): Promise<boolean> {
    const result = await this.db.prepare(
      "INSERT INTO payment_receipts (payment_key, request_key, state, record_json, created_at, updated_at) VALUES (?1, ?2, 'preparing', ?3, ?4, ?4) ON CONFLICT DO NOTHING",
    ).bind(record.paymentKey, record.requestKey, JSON.stringify(record), new Date().toISOString()).run();
    if (!result.success) throw new Error("Payment claim failed");
    return result.meta.changes === 1;
  }
  async transition(paymentKey: string, from: PaymentState, to: PaymentState, response?: SavedResponse): Promise<void> {
    const allowed: Record<PaymentState, PaymentState[]> = {
      preparing: ["settling", "rejected"], settling: ["accepted", "unknown"],
      accepted: [], unknown: [], rejected: [],
    };
    if (!allowed[from].includes(to)) throw new Error("Invalid payment transition");
    const row = await this.db.prepare("SELECT record_json FROM payment_receipts WHERE payment_key = ?1")
      .bind(paymentKey).first<{ record_json: string }>();
    if (!row) throw new Error("Missing payment claim");
    const record = JSON.parse(row.record_json) as PaymentRecord;
    const next = { ...record, state: to, response: response ?? record.response };
    const result = await this.db.prepare(
      "UPDATE payment_receipts SET state = ?1, record_json = ?2, updated_at = ?3 WHERE payment_key = ?4 AND state = ?5",
    ).bind(to, JSON.stringify(next), new Date().toISOString(), paymentKey, from).run();
    if (!result.success || result.meta.changes !== 1) throw new Error("Payment state conflict");
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(k => `${JSON.stringify(k)}:${canonical(record[k])}`).join(",")}}`;
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export function paymentIdentity(payload: { payload: Record<string, unknown> }, network: string, contract: string, requestId: string, resource: string) {
  const auth = payload.payload.authorization as Record<string, unknown> | undefined;
  if (!auth || typeof auth.from !== "string" || !/^0x[\da-fA-F]{40}$/.test(auth.from) ||
      typeof auth.nonce !== "string" || !/^0x[\da-fA-F]{64}$/.test(auth.nonce)) throw new Error("Invalid payment identity");
  const scope = [network, contract.toLowerCase(), auth.from.toLowerCase()];
  return {
    paymentKey: digest([...scope, auth.nonce.toLowerCase()]),
    requestKey: digest([...scope, requestId]),
    fingerprint: digest({ payload, requestId, resource }),
    authorization: { payer: auth.from.toLowerCase(), nonce: auth.nonce.toLowerCase(), network, gatewayWallet: contract.toLowerCase() },
  };
}

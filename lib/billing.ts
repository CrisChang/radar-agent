import type { PaymentRecord } from "./payment-store";
import { classifyPaymentReference } from "./agent-contract";
import { decodeProtocolJson } from "./protocol";

function usdc(atomic: string): string {
  const value = BigInt(atomic);
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, "0")}`;
}
export function billFromRecord(record: PaymentRecord) {
  let receipt: Record<string, unknown> = {};
  let signal: { signal_id?: unknown } = {};
  if (record.state === "accepted" && record.response) {
    const encoded = record.response.headers["payment-response"];
    if (encoded) receipt = decodeProtocolJson(encoded) as Record<string, unknown>;
    signal = JSON.parse(record.response.body);
  }
  return {
    bill_id: record.paymentKey, request_id: record.requestId,
    created_at: record.createdAt ?? null, updated_at: record.updatedAt ?? null,
    status: record.state, amount_usdc: record.terms ? usdc(record.terms.amountAtomic) : null,
    amount_atomic: record.terms?.amountAtomic ?? null, asset: record.terms?.asset ?? null,
    payer: record.authorization?.payer ?? null, pay_to: record.terms?.payTo ?? null,
    network: record.authorization?.network ?? null,
    signal_id: typeof signal.signal_id === "string" ? signal.signal_id : null,
    response_sha256: record.state === "accepted" ? record.response?.headers["x-radar-response-sha256"] ?? null : null,
    payment: classifyPaymentReference(receipt.transaction),
    payment_status: record.state === "accepted" ? "gateway_accepted_not_onchain_verified" :
      ["preparing", "settling", "unknown"].includes(record.state) ? "pending_or_unknown_do_not_repay" : "not_settled",
  };
}
export type Bill = ReturnType<typeof billFromRecord>;
export function billsCsv(bills: Bill[]): string {
  const columns: (keyof Bill)[] = ["bill_id", "request_id", "created_at", "updated_at", "status", "amount_usdc", "payer", "pay_to", "network", "signal_id", "payment_status"];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.join(","), ...bills.map(bill => columns.map(key => cell(bill[key])).join(","))].join("\r\n");
}

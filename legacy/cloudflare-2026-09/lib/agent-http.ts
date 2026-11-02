import { createHash } from "node:crypto";
import type { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { assertUnchangedOffer, validateOffer } from "./agent-contract";
import { assertExecutionNetwork, type ArcNetwork } from "./network";
import type { PriceSignal } from "./signals";

type Requirements = Parameters<BatchEvmScheme["createPaymentPayload"]>[1];
type PayloadCreator = Pick<BatchEvmScheme, "createPaymentPayload">;

export function signalEndpoint(base: string, demo = false): URL {
  const url = new URL(base);
  if (url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Agent endpoint requires HTTPS or loopback HTTP without credentials");
  }
  const endpoint = new URL("/api/signals/latest", url);
  endpoint.searchParams.set("symbol", "ETH-USD");
  if (demo) endpoint.searchParams.set("demo", "sharp_drop");
  return endpoint;
}

async function boundedBody(response: Response): Promise<string> {
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) { await reader.cancel(); throw new Error("Response too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

function headerJson(response: Response, name: string): Record<string, unknown> {
  const raw = response.headers.get(name);
  if (!raw || raw.length > 16_384) throw new Error(`Missing or oversized ${name}`);
  const data = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid protocol metadata");
  return data;
}

export async function discoverSignal(endpoint: URL, network: ArcNetwork, seller: string, maxAtomic: string, requestId: string, fetcher = fetch) {
  if (!/^0x[\da-fA-F]{40}$/.test(seller)) throw new Error("Explicit expected seller address required");
  const response = await fetcher(endpoint, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "x-radar-request-id": requestId } });
  if (response.status !== 402) throw new Error("Expected an unpaid 402 offer");
  const challenge = headerJson(response, "payment-required");
  const offer = validateOffer(challenge, network, maxAtomic);
  if (offer.payTo.toLowerCase() !== seller.toLowerCase()) throw new Error("Seller is not approved by the caller");
  const selected = (challenge.accepts as Requirements[]).find(r => r.network === network.caip2 && r.scheme === "exact")!;
  return { offer, selected, resource: challenge.resource };
}

export function validateSignal(raw: unknown, symbol: string, allowDemo: boolean): PriceSignal {
  const s = raw as PriceSignal;
  if (!s || typeof s !== "object" || typeof s.signal_id !== "string" || !s.signal_id ||
      typeof s.ts !== "string" || !Number.isFinite(Date.parse(s.ts)) || s.symbol !== symbol ||
      !["sharp_drop", "drawdown", "threshold_cross", "stable"].includes(s.type) ||
      !Number.isInteger(s.magnitude_bps) || !Number.isInteger(s.window_s) || s.window_s <= 0 ||
      !Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1 ||
      !Number.isFinite(s.price) || s.price <= 0 || !Number.isFinite(s.reference_price) || s.reference_price <= 0 ||
      typeof s.source !== "string" || !s.source ||
      (s.feed_status !== "live" && !(allowDemo && s.feed_status === "demo"))) throw new Error("Invalid delivered signal");
  const age = Date.now() - Date.parse(s.ts);
  if (age < -30_000 || age > 180_000) throw new Error("Delivered signal is not fresh");
  return s;
}

/** No automatic retry, no redirect forwarding, and no new authorization recovery.
 * The caller reserves budget at its signing hook and retains it on ANY error.
 */
export async function paySignal(endpoint: URL, network: ArcNetwork, quote: Awaited<ReturnType<typeof discoverSignal>>,
  requestId: string, creator: PayloadCreator, fetcher = fetch) {
  assertExecutionNetwork(network);
  assertUnchangedOffer(quote.selected, quote.offer, network);
  const created = await creator.createPaymentPayload(2, quote.selected);
  const authorization = { ...created, resource: quote.resource, accepted: quote.selected };
  const response = await fetcher(endpoint, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: {
    "x-radar-request-id": requestId,
    "payment-signature": Buffer.from(JSON.stringify(authorization)).toString("base64"),
  } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Paid request returned ${response.status}; retain reserved budget and reconcile, do not repay`); }
  const body = await boundedBody(response);
  const responseHash = createHash("sha256").update(body).digest("hex");
  if (response.headers.get("x-radar-request-id") !== requestId ||
      response.headers.get("x-radar-response-sha256") !== responseHash ||
      response.headers.get("x-radar-payment-state") !== "gateway_accepted_not_onchain_verified") {
    throw new Error("Delivery metadata does not match the received response");
  }
  const payment = headerJson(response, "payment-response");
  const payer = (created.payload as { authorization?: { from?: string } }).authorization?.from;
  if (payment.success !== true || payment.network !== network.caip2 ||
      typeof payment.transaction !== "string" || !payment.transaction || typeof payment.payer !== "string" ||
      !payer || payment.payer.toLowerCase() !== payer.toLowerCase()) throw new Error("Payment acceptance metadata requires reconciliation");
  const signal = validateSignal(JSON.parse(body), endpoint.searchParams.get("symbol") ?? "ETH-USD", endpoint.searchParams.get("demo") === "sharp_drop");
  return { signal, responseHash, transaction: payment.transaction, requestId,
    amountUsdc: Number(quote.offer.amountAtomic) / 1_000_000 };
}

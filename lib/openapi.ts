import { getArcConfig } from "./arc";
export function openapiDocument(origin: string) {
  const arc = getArcConfig();
  return {
    openapi: "3.1.0", info: { title: "Radar Agent", version: "0.2.0",
      description: "Pay-per-query market signals and wallet-scoped receipts. Gateway acceptance is not independent onchain confirmation." },
    servers: [{ url: origin }],
    paths: {
      "/api/health": { get: { summary: "Read-only service and storage readiness",
        parameters: ["feed", "store"].map(name => ({ name, in: "query", schema: { type: "string", enum: ["1"] } })),
        responses: { "200": { description: "Configured metadata; inspect payment_acceptance and payment_store" }, "503": { description: "Requested probe unavailable" } } } },
      "/api/signals/latest": { get: { summary: "Discover or purchase one live ETH/BTC signal",
        description: "First request without payment-signature returns 402. A paid request needs a stable caller-generated UUID, the approved original authorization, and enabled durable storage. Never automatically sign a replacement after a timeout.",
        parameters: [
          { name: "symbol", in: "query", schema: { type: "string", enum: ["ETH-USD", "BTC-USD"], default: "ETH-USD" } },
          { name: "x-radar-request-id", in: "header", schema: { type: "string", format: "uuid" } },
          { name: "payment-signature", in: "header", schema: { type: "string" }, description: "Base64 x402 v2 authorization; keep private" }],
        responses: { "200": { description: "Signal bytes and validated delivery digest", headers: {
          "payment-response": { schema: { type: "string" }, description: "Gateway receipt, not onchain proof" },
          "x-radar-response-sha256": { schema: { type: "string" } }, "x-radar-request-id": { schema: { type: "string" } } } },
          "402": { description: "Unpaid offer in payment-required" }, "409": { description: "Conflicting or uncertain payment; do not repay" },
          "502": { description: "Payment processing uncertainty; retain budget" }, "503": { description: "Payments paused, feed or durable store unavailable" } } } },
      "/api/billing": { get: { summary: "Read only the signing wallet's latest receipts",
        description: "EOA personal-sign authorization binds origin, network, exact GET path/query and timestamp. See docs/AGENT_INTEGRATION.md for the canonical message. Signature expires in 300 seconds. No reusable payment authorization is returned.",
        parameters: [
          ...["x-radar-wallet", "x-radar-auth-timestamp", "x-radar-auth-signature"].map(name => ({ name, in: "header", required: true, schema: { type: "string" } })),
          { name: "request_id", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          { name: "format", in: "query", schema: { type: "string", enum: ["csv"] } }],
        responses: { "200": { description: "Wallet-scoped JSON receipts or CSV export" }, "401": { description: "Invalid or expired read authorization" },
          "404": { description: "No receipt for this request and wallet" }, "503": { description: "Billing storage unavailable" } } } },
      "/api/gateway-balance": { get: { summary: "Read-only Gateway balance",
        parameters: [{ name: "wallet", in: "query", required: true, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } }],
        responses: { "200": { description: "Available Gateway USDC; no deposits performed" }, "503": { description: "Balance not verified" } } } },
    },
    "x-radar-network": arc.network,
    "x-radar-mainnet-treasury": "disabled",
  };
}

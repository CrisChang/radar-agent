import { getArcNetwork } from "./network";

export function buildOpenApi() {
  const network = getArcNetwork();
  return {
    openapi: "3.1.0",
    info: {
      title: "Radar Agent Signal API", version: "0.2.0-integration",
      description: "Structured ETH/BTC signals for other agents. Testnet payment prototype; mainnet execution is blocked. Signals are heuristic market observations, not calibrated probabilities or investment advice. Gateway acceptance is not onchain settlement proof.",
    },
    servers: [{ url: "/", description: "Same origin as this document" }],
    "x-radar-network": { chainId: network.chainId, caip2: network.caip2, mainnetExecutionEnabled: false },
    paths: {
      "/api/health": { get: { operationId: "getRadarHealth", summary: "Read deployment and evidence scope", responses: { "200": { description: "Configuration metadata, not a payment readiness guarantee" }, "503": { description: "Invalid configuration" } } } },
      "/api/signals/latest": {
        get: {
          operationId: "getLatestMarketSignal",
          summary: "Buy one current structured market signal",
          description: "First request without payment. Validate the 402 offer against your chain, USDC asset, seller allowlist and budget. Only pay with explicit wallet policy. Mainnet payments are disabled in this release. Never automatically repay an unknown settlement. A server response hash records prepared output, not proof the client received it. Demo fixtures are testnet-only and opt-in.",
          parameters: [
            { name: "symbol", in: "query", schema: { type: "string", enum: ["ETH-USD", "BTC-USD"], default: "ETH-USD" } },
            { name: "x-radar-request-id", in: "header", required: false, description: "A caller-generated UUID, required on paid requests. Keep the same ID and exact authorization when retrying the same logical request. Never create a new payment for an unknown outcome.", schema: { type: "string", format: "uuid" } },
            { name: "payment-signature", in: "header", required: false, description: "Base64 x402 v2 authorization. Never include in public reports or logs.", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Paid signal; payment accepted by Gateway. Separate batch settlement reconciliation is still required.",
              headers: {
                "payment-response": { description: "Base64 x402 settlement response; transaction may be a Gateway reference, not a chain hash", schema: { type: "string" } },
                "x-radar-request-id": { schema: { type: "string", format: "uuid" } },
                "x-radar-response-sha256": { description: "SHA-256 of the exact UTF-8 response body", schema: { type: "string", pattern: "^[a-f0-9]{64}$" } },
                "x-radar-payment-state": { schema: { type: "string", const: "gateway_accepted_not_onchain_verified" } },
                "x-radar-replayed": { description: "True when serving the original stored response; not a second paid delivery", schema: { type: "string", const: "true" } },
              },
              content: { "application/json": { schema: { $ref: "#/components/schemas/PriceSignal" } } },
            },
            "400": { description: "Invalid query or payment payload; no payment accepted" },
            "402": { description: "Payment required or rejected", headers: { "payment-required": { description: "Base64 x402 v2 challenge (on the initial unpaid request)", schema: { type: "string" } } } },
            "409": { description: "Request/authorization conflict or pending outcome: do not repay. Exact accepted retries may recover the stored response." },
            "502": { description: "Provider failure; unknown_do_not_repay means investigate before retrying payment" },
            "503": { description: "Mainnet execution disabled, durable store missing, seller misconfigured, or fresh data unavailable" },
          },
        },
      },
    },
    components: { schemas: { PriceSignal: {
      type: "object", additionalProperties: false,
      required: ["signal_id", "ts", "type", "symbol", "magnitude_bps", "window_s", "confidence", "price", "reference_price", "source", "feed_status"],
      properties: {
        signal_id: { type: "string" }, ts: { type: "string", format: "date-time" },
        type: { type: "string", enum: ["sharp_drop", "drawdown", "threshold_cross", "stable"] },
        symbol: { type: "string", enum: ["ETH-USD", "BTC-USD"] },
        magnitude_bps: { type: "integer" }, window_s: { type: "integer", minimum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1, description: "Heuristic score, not a forecast probability" },
        price: { type: "number", minimum: 0 }, reference_price: { type: "number", minimum: 0 },
        source: { type: "string" }, feed_status: { type: "string", enum: ["live", "stale", "demo"] },
      },
    } } },
  };
}

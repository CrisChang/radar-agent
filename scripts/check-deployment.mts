import { writeFile } from "node:fs/promises";
import { getArcConfig, type ArcNetwork } from "../lib/arc";
import { validateSignalPayment } from "../lib/buyer-payment";
import type { HookPaymentRequirements } from "@circle-fin/x402-batching";

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

try {
  const rawUrl = option("--url");
  if (!rawUrl) throw new Error("Usage: npm run check:deployment -- --url https://your-demo --network mainnet [--output file.json]");
  const base = new URL(rawUrl);
  if (base.username || base.password || base.search || base.hash) {
    throw new Error("deployment URL must not contain credentials, query strings or fragments");
  }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("use HTTPS, or HTTP for localhost only");
  }
  const mode = (option("--network") ?? "mainnet") as ArcNetwork;
  const arc = getArcConfig({ ARC_NETWORK: mode });
  const healthResponse = await fetch(new URL("/api/health", base), { signal: AbortSignal.timeout(10_000) });
  if (!healthResponse.ok) throw new Error(`health check failed: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (health.service !== "radar-agent" || health.chain_id !== arc.chainId || health.status !== "configured") {
    throw new Error("deployment health does not match the requested Arc network");
  }
  const endpoint = new URL("/api/signals/latest?symbol=ETH-USD", base);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
  if (response.status !== 402) throw new Error(`paid endpoint must return 402 without a payment; got ${response.status}`);
  const header = response.headers.get("payment-required");
  if (!header) throw new Error("paid endpoint omitted payment-required");
  const challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  if (challenge.x402Version !== 2 || challenge.resource?.url !== endpoint.toString()) {
    throw new Error("incorrect x402 version or resource URL");
  }
  const requirements = challenge.accepts?.[0] as HookPaymentRequirements | undefined;
  if (!requirements) throw new Error("missing x402 payment requirements");
  const advertisedPrice = Number(health.payment.amount) / 1_000_000;
  validateSignalPayment(requirements, arc, health.payment.payTo, advertisedPrice.toFixed(6));
  const result = {
    checked_at: new Date().toISOString(),
    deployment_url: base.origin,
    network: arc.network,
    chain_id: arc.chainId,
    recipient: requirements.payTo,
    price_usdc: advertisedPrice,
    health_http: healthResponse.status,
    unpaid_http: response.status,
    payment_completed: false,
    note: "Read-only configuration check. No signature, deposit or payment was made. Mainnet payment evidence is still required.",
  };
  if (option("--output")) await writeFile(option("--output")!, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "deployment check failed");
  process.exitCode = 1;
}

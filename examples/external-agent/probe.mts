/** Independent HTTP integration example: never loads a wallet or signs a payment. */
import { getArcNetwork } from "../../lib/network";
import { validateOffer } from "../../lib/agent-contract";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function arg(name: string, fallback?: string) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const base = new URL(arg("--url", "http://localhost:3000")!);
if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) throw new Error("Use HTTPS or loopback HTTP without embedded credentials");
const network = getArcNetwork(arg("--network", "testnet"));
const expectedSeller = arg("--seller");
const observations: { path: string; status: number; elapsedMs: number }[] = [];
async function get(path: string) {
  const start = performance.now();
  const response = await fetch(new URL(path, base), { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
  observations.push({ path, status: response.status, elapsedMs: Math.round(performance.now() - start) });
  return response;
}
const healthResponse = await get("/api/health");
if (!healthResponse.ok) throw new Error("Service health failed");
const health = await healthResponse.json();
if (health.chainId !== network.chainId) throw new Error("Service is on a different chain");
const specResponse = await get("/api/openapi");
if (!specResponse.ok) throw new Error("Published OpenAPI is missing");
const spec = await specResponse.json();
if (spec.openapi !== "3.1.0" || !spec.paths?.["/api/signals/latest"]?.get || spec["x-radar-network"]?.chainId !== network.chainId) throw new Error("OpenAPI contract/network mismatch");
const response = await get("/api/signals/latest?symbol=ETH-USD");
if (response.status !== 402) throw new Error(`Expected unpaid 402, received ${response.status}`);
const header = response.headers.get("payment-required");
if (!header || header.length > 16_384) throw new Error("Missing or oversized payment challenge");
const offer = validateOffer(JSON.parse(Buffer.from(header, "base64").toString("utf8")), network, arg("--max-atomic", "1000"));
if (expectedSeller && offer.payTo.toLowerCase() !== expectedSeller.toLowerCase()) throw new Error("Seller does not match caller allowlist");
const report = { capturedAt: new Date().toISOString(), kind: "unpaid_agent_contract_probe", targetOrigin: base.origin, network: network.caip2, offer, sellerAllowlistChecked: !!expectedSeller, observations, signedRequests: 0, payments: 0, deliveredPaidSignals: 0, onchainVerified: false, note: "HTTP challenge compatibility only; not an external customer, paid delivery, or production-readiness proof" };
if (args.includes("--save")) {
  const directory = resolve(import.meta.dirname, "../../docs/evidence");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `agent-probe-${report.capturedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.error(`Saved read-only evidence: ${path}`);
}
console.log(JSON.stringify(report, null, 2));

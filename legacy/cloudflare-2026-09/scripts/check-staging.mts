/** Public discovery-only HTTP smoke test. No dotenv, wallets, signatures or payments. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
assert.ok(urlIndex >= 0 && args[urlIndex + 1], "Pass --url with the approved staging origin");
const origin = new URL(args[urlIndex + 1]);
assert.equal(origin.protocol, "https:");
assert.equal(origin.username + origin.password, "");
assert.equal(origin.pathname, "/");
assert.equal(origin.search + origin.hash, "");

const observations: { path: string; status: number; elapsedMs: number; syntheticHeader: boolean }[] = [];
async function get(path: string, syntheticHeader = false) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), {
    redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: syntheticHeader
      ? { accept: "application/json", "payment-signature": "staging-negative-test-NOT-A-PAYMENT-AUTHORIZATION" }
      : { accept: "application/json" },
  });
  const raw = await response.text();
  assert.ok(raw.length < 262_144, "Oversized response");
  observations.push({ path, status: response.status, elapsedMs: Math.round(performance.now() - start), syntheticHeader });
  return { response, body: JSON.parse(raw) };
}

const health = await get("/api/health");
assert.equal(health.response.status, 200);
assert.equal(health.body.service, "radar-agent");
assert.equal(health.body.chainId, 5042002);
assert.equal(health.body.deployment, "discovery-only");
assert.equal(health.body.payment_execution, "disabled");
assert.equal(health.body.mainnet_execution_enabled, false);
assert.equal(health.body.durable_payment_store, "schema_read_verified");
assert.match(health.response.headers.get("cache-control") ?? "", /no-store/);

const spec = await get("/api/openapi");
assert.equal(spec.response.status, 200);
assert.equal(spec.body["x-radar-payment-acceptance-enabled"], false);
for (const symbol of ["ETH-USD", "BTC-USD"]) {
  const quote = await get(`/api/signals/latest?symbol=${symbol}`);
  assert.equal(quote.response.status, 402);
  assert.ok(quote.response.headers.get("payment-required"));
}
const invalid = await get("/api/signals/latest?symbol=INVALID");
assert.equal(invalid.response.status, 400);
const demo = await get("/api/signals/latest?symbol=ETH-USD&demo=sharp_drop");
assert.equal(demo.response.status, 400);
const disabled = await get("/api/signals/latest?symbol=ETH-USD", true);
assert.equal(disabled.response.status, 503);
assert.equal(disabled.body.payment_status, "not_settled");

const report = {
  capturedAt: new Date().toISOString(), kind: "cloud_staging_discovery_smoke",
  targetOrigin: origin.origin, health: health.body, observations,
  transport: process.env.NODE_USE_ENV_PROXY === "1" ? "operator_configured_environment_proxy" : "direct",
  tests: { schemaRead: "passed", discoveryOnly: "passed", unpaidEthQuote: "passed", unpaidBtcQuote: "passed", invalidQuery: "passed", demoDisabled: "passed", syntheticPaymentHeaderBlocked: "passed" },
  signedRequests: 0, acceptedPayments: 0, deliveredPaidSignals: 0, transactions: 0,
  caller: "project-owned no-wallet test program",
  note: "Public HTTP + D1 schema-read evidence only; not cloud paid-response recovery, third-party adoption, paid delivery or onchain settlement. The negative-test header is not a payment authorization.",
};
if (args.includes("--save")) {
  const directory = resolve(import.meta.dirname, "../docs/evidence");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `cloud-staging-${report.capturedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.error(`Saved discovery-only evidence: ${path}`);
}
console.log(JSON.stringify(report, null, 2));

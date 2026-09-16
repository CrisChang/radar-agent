/** Isolated built-Worker/D1 smoke test. Does NOT load dotenv, wallets or secrets.
 * All outbound HTTP is disabled, so this cannot reach Gateway or broadcast.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Miniflare, createFetchMock } from "miniflare";
import { D1PaymentStore, type PaymentDatabase } from "../lib/payment-store";

const root = resolve(import.meta.dirname, "..");
const persist = await mkdtemp(join(tmpdir(), "radar-worker-d1-"));
const outbound = createFetchMock(); outbound.disableNetConnect();
const serverRoot = resolve(root, "dist/server");
const files = (await readdir(serverRoot, { recursive: true })).filter(p => /\.m?js$/.test(p) && p !== "index.js").sort();
const runtime = new Miniflare({
  modules: ["index.js", ...files].map(path => ({ type: "ESModule" as const, path: resolve(serverRoot, path) })),
  modulesRoot: serverRoot,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: { RADAR_PAYMENTS: "local-smoke-database" }, d1Persist: persist,
  bindings: { RADAR_NETWORK: "testnet", SELLER_ADDRESS: "0x1111111111111111111111111111111111111111", SIGNAL_PRICE_USDC: "0.001", RADAR_ALLOW_DEMO_SIGNALS: "false" },
  fetchMock: outbound,
});
try {
  const db = await runtime.getD1Database("RADAR_PAYMENTS");
  const sql = await readFile(resolve(root, "migrations/0001_payment_receipts.sql"), "utf8");
  await db.batch(sql.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  const store = new D1PaymentStore(db as unknown as PaymentDatabase);
  const record = { paymentKey: "fake-auth-for-local-storage-test", requestKey: "fake-request", fingerprint: "fake-digest", requestId: "fixture", state: "preparing" as const };
  assert.equal(await store.claim(record), true);
  assert.equal(await store.claim(record), false);
  await store.transition(record.paymentKey, "preparing", "settling", { status: 200, body: "explicit-local-storage-fixture", headers: {} });
  await store.transition(record.paymentKey, "settling", "accepted");
  assert.equal((await store.find(record.paymentKey, record.requestKey))?.state, "accepted");

  const health = await runtime.dispatchFetch("http://localhost/api/health");
  const healthBody = await health.json() as { durable_payment_store?: string; chainId?: number };
  assert.equal(health.status, 200); assert.equal(healthBody.chainId, 5042002);
  assert.equal(healthBody.durable_payment_store, "binding_present_not_database_health_proof");
  const spec = await runtime.dispatchFetch("http://localhost/api/openapi"); assert.equal(spec.status, 200);
  const quote = await runtime.dispatchFetch("http://localhost/api/signals/latest?symbol=ETH-USD");
  assert.equal(quote.status, 402); assert.ok(quote.headers.get("payment-required"));
  const invalid = await runtime.dispatchFetch("http://localhost/api/signals/latest?symbol=DOGE-USD"); assert.equal(invalid.status, 400);
  const report = { capturedAt: new Date().toISOString(), kind: "local_worker_d1_smoke", runtime: "Miniflare/workerd",
    tests: { migration: "passed", atomicClaim: "passed", savedResponse: "passed", requestBinding: "passed", health: 200, openapi: 200, unpaidQuote: 402, invalidQuery: 400 },
    outboundNetwork: "disabled", payments: 0, signatures: 0, transactions: 0,
    note: "Local runtime + storage fixture; not paid delivery, cloud deployment, external adoption or chain settlement." };
  const directory = resolve(root, "docs/evidence"); await mkdir(directory, { recursive: true });
  const path = resolve(directory, `worker-d1-${report.capturedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report, null, 2));
  console.log(`Saved report: ${path}`);
} finally { await runtime.dispose(); await outbound.close(); }

import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/health/route";
import { withPaymentDatabase } from "../lib/payment-context";
import { paymentDatabase } from "./helpers/payment-db";

process.env.RADAR_NETWORK = "testnet";
process.env.RADAR_ACCEPT_PAYMENTS = "false";

test("health checks the actual schema without exposing payment records", async () => {
  const { database, store } = paymentDatabase();
  await store.claim({ paymentKey: "not-public", requestKey: "not-public", fingerprint: "not-public", requestId: "not-public", state: "preparing" });
  const response = await withPaymentDatabase(database, GET);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.durable_payment_store, "schema_read_verified");
  assert.equal(body.deployment, "discovery-only");
  assert.equal(body.payment_execution, "disabled");
  assert.doesNotMatch(JSON.stringify(body), /not-public/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("missing database is degraded, not healthy", async () => {
  const response = await withPaymentDatabase(undefined, GET);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).durable_payment_store, "missing");
});

test("a binding with no migrated schema fails health without exposing SQL errors", async () => {
  const { database, sqlite } = paymentDatabase();
  sqlite.exec("DROP TABLE payment_receipts"); // disposable in-memory test DB only
  const response = await withPaymentDatabase(database, GET);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.durable_payment_store, "unavailable_or_unmigrated");
  assert.doesNotMatch(JSON.stringify(body), /SQLITE|no such table/);
});

test("invalid network fails closed", async () => {
  process.env.RADAR_NETWORK = "typo";
  try {
    const response = await GET();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "invalid_network");
  } finally { process.env.RADAR_NETWORK = "testnet"; }
});

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { paymentDatabase } from "./helpers/payment-db";
import type { PaymentRecord } from "../lib/payment-store";

const record: PaymentRecord = { paymentKey: "authorization-1", requestKey: "logical-request-1", fingerprint: "digest-not-secret", requestId: "id", state: "preparing" };
test("SQL uniqueness and compare-and-set enforce legal durable state transitions", async () => {
  const { store } = paymentDatabase();
  const winners = await Promise.all(Array.from({ length: 8 }, () => store.claim(record)));
  assert.equal(winners.filter(Boolean).length, 1);
  assert.equal(await store.claim({ ...record, paymentKey: "another-authorization" }), false);
  await store.transition(record.paymentKey, "preparing", "settling", { status: 200, body: "paid-content", headers: {} });
  await assert.rejects(store.transition(record.paymentKey, "preparing", "settling"), /conflict/);
  await store.transition(record.paymentKey, "settling", "unknown");
  await assert.rejects(store.transition(record.paymentKey, "unknown", "accepted"), /Invalid/);
});
test("prepared response and unknown state survive reopening the database", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "radar-payment-restart-")), "ledger.sqlite");
  const first = paymentDatabase(path);
  await first.store.claim(record);
  await first.store.transition(record.paymentKey, "preparing", "settling", { status: 200, body: "recoverable-bytes", headers: {} });
  first.sqlite.close();
  const second = paymentDatabase(path);
  const loaded = await second.store.find(record.paymentKey, record.requestKey);
  assert.equal(loaded?.state, "settling");
  assert.equal(loaded?.response?.body, "recoverable-bytes");
  assert.equal(await second.store.claim(record), false);
});

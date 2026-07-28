import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decide } from "../lib/decision";
import {
  CapExceeded,
  DisciplineEngine,
  DuplicateAction,
  PositionUnsafe,
} from "../lib/discipline";
import {
  buildDemoSignal,
  buildSignalFromCandles,
  type CoinbaseCandle,
} from "../lib/signals";

test("builds a sharp-drop signal from ordered or reversed candles", () => {
  const candles: CoinbaseCandle[] = [
    [120, 97, 100, 99, 98.2, 10],
    [0, 99, 101, 100, 99.5, 8],
    [60, 98, 100, 99.5, 99, 9],
  ];
  const signal = buildSignalFromCandles("ETH-USD", candles);
  assert.equal(signal.type, "sharp_drop");
  assert.equal(signal.magnitude_bps, -180);
  assert.equal(signal.window_s, 180);
  assert.equal(signal.feed_status, "live");
});

test("decision rule rebalances only for a fresh confident sharp drop", () => {
  const signal = buildDemoSignal("ETH-USD", new Date("2026-07-28T00:00:00Z"));
  assert.equal(decide(signal).action, "rebalance_to_reserve");
  assert.equal(
    decide({ ...signal, feed_status: "stale" }).action,
    "hold",
  );
  assert.equal(decide({ ...signal, confidence: 0.89 }).action, "hold");
  assert.throws(() => buildDemoSignal("DOGE-USD"), /unsupported symbol/);
});

test("discipline layer enforces caps, reserve, idempotency and audit", () => {
  const directory = mkdtempSync(join(tmpdir(), "radar-discipline-"));
  const state = join(directory, "discipline.json");
  const audit = join(directory, "audit.jsonl");
  const engine = new DisciplineEngine(
    state,
    audit,
    { data: 0.002, treasury: 10 },
    3,
  );

  engine.authorizeSpend("data", 0.001);
  engine.recordSpend("data", 0.001);
  assert.throws(() => engine.authorizeSpend("data", 0.001001), CapExceeded);

  assert.throws(
    () =>
      engine.assertTreasuryTransferSafe({
        sourceBalanceUsdc: 6,
        transferUsdc: 2,
        minimumRemainingUsdc: 5,
      }),
    PositionUnsafe,
  );

  const key = DisciplineEngine.actionKey(
    "2026-07-28",
    "signal-1",
    "rebalance",
  );
  engine.reserveAction(key);
  assert.throws(() => engine.reserveAction(key), DuplicateAction);
  engine.completeAction(key, "0xabc");
  engine.audit("test_event", { key });
  assert.match(readFileSync(audit, "utf8"), /"event":"test_event"/);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireAgentLock } from "../lib/agent-lock";
import { CapExceeded, DisciplineEngine, UnresolvedSpend } from "../lib/discipline";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "radar-budget-"));
  const state = join(root, "state.json");
  return { root, state, engine: () => new DisciplineEngine(state, join(root, "audit.jsonl"), { data: 0.002, treasury: 5 }) };
}
test("unknown spend remains reserved across restart and UTC day rotation", () => {
  const f = fixture(); const engine = f.engine();
  engine.reserveSpend("paid-request", "data", 0.002);
  engine.markSpendUnknown("paid-request");
  const saved = JSON.parse(readFileSync(f.state, "utf8")); saved.day = "2020-01-01";
  writeFileSync(f.state, JSON.stringify(saved));
  const restarted = f.engine();
  assert.throws(() => restarted.preflight(), UnresolvedSpend);
  assert.throws(() => restarted.authorizeSpend("data", 0.000001), CapExceeded);
  restarted.resetBreaker();
  assert.throws(() => restarted.preflight(), UnresolvedSpend);
});
test("settlement moves a reservation to recorded spend exactly once", () => {
  const f = fixture(); const engine = f.engine();
  engine.reserveSpend("request", "data", 0.001);
  assert.throws(() => engine.settleSpend("request", 0.002, "ref"));
  engine.settleSpend("request", 0.001, "ref");
  assert.throws(() => engine.settleSpend("request", 0.001, "ref"));
  assert.throws(() => engine.authorizeSpend("data", 0.001001), CapExceeded);
  assert.doesNotThrow(() => f.engine().preflight());
});
test("legacy spend and action keys survive additive ledger migration", () => {
  const f = fixture();
  writeFileSync(f.state, JSON.stringify({ day: new Date().toISOString().slice(0, 10), spendMicrounits: { data: 2000, treasury: 0 }, actions: { old: { status: "pending", updatedAt: "old" } }, breaker: { consecutiveFailures: 0, halted: false } }));
  const engine = f.engine();
  assert.throws(() => engine.authorizeSpend("data", 0.001), CapExceeded);
  assert.throws(() => engine.reserveAction("old"));
});
test("exclusive CLI lock refuses a competing cycle instead of overwriting its state", () => {
  const f = fixture(); const path = join(f.root, "cycle.lock");
  const release = acquireAgentLock(path);
  assert.throws(() => acquireAgentLock(path), /AGENT_LOCKED/);
  release();
  const next = acquireAgentLock(path); next();
});

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("a terminated client recovers its accepted fixture purchase across processes without another signature or charge", { timeout: 60000 }, () => {
  const run = spawnSync(process.execPath, ["--import", "tsx", "examples/recovery-demo/run.mts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: "test" },
    encoding: "utf8", timeout: 50000, maxBuffer: 65536,
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.evidence, "OFFLINE_SYNTHETIC_ONLY");
  assert.equal(result.realPayments, 0);
  assert.equal(result.chainVerified, false);
  assert.equal(result.signatures, 1);
  assert.equal(result.simulatedCharges, 1);
  assert.equal(result.paidRequestAttempts, 2);
  assert.deepEqual(result.stages.map((s: { state: string }) => s.state), ["submitted", "accepted", "accepted"]);
  assert.equal(new Set(result.stages.map((s: { pid: number }) => s.pid)).size, 3);
  assert.equal(result.responseHashMatches, true);
});

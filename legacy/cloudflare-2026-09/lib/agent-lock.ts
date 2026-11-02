import { closeSync, fsyncSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Single-host CLI exclusion. A crash leaves a lock for manual reconciliation;
 * do not auto-expire it while a payment or send might still be in flight.
 */
export function acquireAgentLock(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("AGENT_LOCKED: another cycle or unreconciled crash owns this state directory");
    throw error;
  }
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); fsyncSync(fd); }
  catch (error) { closeSync(fd); throw error; }
  closeSync(fd);
  let released = false;
  return () => { if (!released) { unlinkSync(path); released = true; } };
}

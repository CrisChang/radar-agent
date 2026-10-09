import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const file = process.argv[2] ?? resolve("agent/state/mainnet/audit.jsonl");
const events = readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
console.log(JSON.stringify(events.filter(event => ["payment_authorization_created", "signal_delivery_validated", "signal_purchased", "decision_made", "cycle_failed", "gateway_deposit"].includes(event.event)), null, 2));

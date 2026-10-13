import { CAMPAIGN_ID } from "./validation-plan";
export function controlMessage(origin: string, action: string, timestamp: string) {
  if (!["reconcile", "pause", "resume"].includes(action) || !/^\d{10}$/.test(timestamp)) throw new Error("Invalid control action");
  return ["Radar Agent reliability test control", `Origin: ${new URL(origin).origin}`, `Campaign: ${CAMPAIGN_ID}`,
    "Network: eip155:5042", `Action: ${action}`, `Issued at: ${timestamp}`, "Expires in: 300 seconds",
    "This signature does not authorize payments, deposits, token approvals or withdrawals."].join("\n");
}

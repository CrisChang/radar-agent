import { readFile } from "node:fs/promises";
import { assertExecutionNetwork, getArcNetwork } from "../lib/network";

// Guard the legacy deploy command: without D1, publishing would disable paid
// routes. This checks configuration only; it never creates/deploys resources.
const config = JSON.parse(await readFile(new URL("../wrangler.direct.jsonc", import.meta.url), "utf8"));
assertExecutionNetwork(getArcNetwork(config.vars?.RADAR_NETWORK));
const database = config.d1_databases?.find((d: { binding?: string }) => d.binding === "RADAR_PAYMENTS");
if (!database?.database_id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(database.database_id)) {
  throw new Error("DEPLOYMENT_BLOCKED: legacy config has no real RADAR_PAYMENTS D1 binding. Follow docs/STAGING_AND_PILOT.md; preserve the existing demo.");
}
console.log("Testnet deployment config has a D1 binding; migration/permissions still require verification.");

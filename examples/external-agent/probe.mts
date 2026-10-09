import { getArcConfig, getSellerAddress } from "../../lib/arc";
import { discoverSignal, signalEndpoint } from "../../lib/agent-http";
import { randomUUID } from "node:crypto";
const base = process.env.BASE_URL;
if (!base) throw new Error("Set BASE_URL to the public Radar Agent origin");
const arc = getArcConfig();
const endpoint = signalEndpoint(base);
const health = await fetch(new URL("/api/health?feed=1&store=1", base), { redirect: "error", signal: AbortSignal.timeout(15_000) }).then(r => r.json());
const quote = await discoverSignal(endpoint, arc, getSellerAddress(), "1000", randomUUID());
console.log(JSON.stringify({ payment_attempted: false, network: arc.network,
  feed: health.feed, payment_acceptance: health.payment_acceptance, payment_store: health.payment_store,
  approved_quote: quote.offer }, null, 2));

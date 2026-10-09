import { privateKeyToAccount } from "viem/accounts";
import { getArcConfig } from "../../lib/arc";
import { validateBuyerSigner } from "../../lib/buyer-payment";
import { billingMessage } from "../../lib/billing-auth";
const base = process.env.BASE_URL;
const key = process.env.BUYER_PRIVATE_KEY;
if (!base || !key) throw new Error("Configure BASE_URL and a local BUYER_PRIVATE_KEY; never paste the key into chat");
const arc = getArcConfig();
const wallet = validateBuyerSigner(key, process.env.BUYER_ADDRESS, arc);
if (!process.argv.includes("--allow-read-signature")) throw new Error("This command signs a 5-minute, read-only receipt request. Review it, then use --allow-read-signature.");
const account = privateKeyToAccount(key as `0x${string}`);
const url = new URL("/api/billing?limit=50", base);
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("HTTPS is required");
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = await account.signMessage({ message: billingMessage({ url: url.toString(), network: arc.network, wallet, timestamp }) });
const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: {
  "x-radar-wallet": wallet, "x-radar-auth-timestamp": timestamp, "x-radar-auth-signature": signature } });
if (!response.ok) throw new Error(`Billing read returned ${response.status}; no payment attempted`);
console.log(JSON.stringify(await response.json(), null, 2));

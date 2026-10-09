import { verifyMessage } from "viem";

export const BILLING_AUTH_SECONDS = 300;
export const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function billingMessage(input: { url: string; network: string; wallet: string; timestamp: string }): string {
  const url = new URL(input.url);
  return ["Radar Agent billing read", `Origin: ${url.origin}`, `Network: ${input.network}`,
    `Wallet: ${input.wallet.toLowerCase()}`, "Method: GET", `Path: ${url.pathname}${url.search}`,
    `Issued at: ${input.timestamp}`, `Expires in: ${BILLING_AUTH_SECONDS} seconds`,
    "This signature only authorizes reading this wallet's Radar Agent receipts."].join("\n");
}
export async function authenticateBilling(request: Request, canonicalUrl: string, network: string, now = Date.now()): Promise<string> {
  const wallet = request.headers.get("x-radar-wallet") ?? "";
  const timestamp = request.headers.get("x-radar-auth-timestamp") ?? "";
  const signature = request.headers.get("x-radar-auth-signature") ?? "";
  if (!/^0x[\da-fA-F]{40}$/.test(wallet) || /^0x0{40}$/i.test(wallet) ||
      !/^\d{10}$/.test(timestamp) || !/^0x[\da-fA-F]{130}$/.test(signature)) throw new Error("Wallet read authorization required");
  const age = Math.floor(now / 1000) - Number(timestamp);
  if (age < -30 || age > BILLING_AUTH_SECONDS) throw new Error("Wallet read authorization expired");
  const valid = await verifyMessage({ address: wallet as `0x${string}`,
    message: billingMessage({ url: canonicalUrl, network, wallet, timestamp }), signature: signature as `0x${string}` });
  if (!valid) throw new Error("Wallet read authorization is invalid");
  return wallet.toLowerCase();
}

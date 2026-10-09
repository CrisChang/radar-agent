import { NextRequest, NextResponse } from "next/server";
import { getArcConfig } from "@/lib/arc";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
  if (!/^0x[\da-fA-F]{40}$/.test(wallet) || /^0x0{40}$/i.test(wallet)) return NextResponse.json({ error: "A nonzero EVM wallet is required" }, { status: 400 });
  const arc = getArcConfig();
  try {
    const response = await fetch(`${arc.facilitatorUrl}/v1/balances`, { method: "POST", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "USDC", sources: [{ depositor: wallet, domain: 26 }] }) });
    if (!response.ok) throw new Error("Balance provider unavailable");
    const data = await response.json() as { balances?: { balance?: unknown }[] };
    const available = data.balances?.[0]?.balance;
    if (typeof available !== "string" || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(available)) throw new Error("Invalid balance");
    return NextResponse.json({ network: arc.network, wallet, gateway_available_usdc: available,
      automatic_deposit: false }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to verify Gateway balance; no funding or payment was attempted" }, { status: 503, headers: { "cache-control": "no-store" } }); }
}

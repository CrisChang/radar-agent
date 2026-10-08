import { NextRequest, NextResponse } from "next/server";
import { getArcConfig } from "@/lib/arc";
import { getLatestSignal } from "@/lib/signals";
import { buildPaymentRequirements } from "@/lib/x402";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const arc = getArcConfig();
    const requirements = buildPaymentRequirements(process.env.SIGNAL_PRICE_USDC ?? "0.001");
    // An explicit deployment probe checks real egress without signing a payment
    // or exposing the paid price signal. Ordinary health checks stay lightweight.
    const feed = request.nextUrl.searchParams.get("feed") === "1"
      ? await getLatestSignal("ETH-USD")
      : undefined;
    const feedUnavailable = feed?.feed_status === "stale";
    return NextResponse.json({
      service: "radar-agent",
      status: feedUnavailable ? "feed_unavailable" : "configured",
      network: arc.name,
      chain_id: arc.chainId,
      paid_endpoint: "/api/signals/latest",
      payment: requirements,
      ...(feed ? { feed: { status: feed.feed_status, source: feed.source, ts: feed.ts } } : {}),
      // Configuration is not proof of a completed mainnet payment.
      treasury_execution: arc.mode === "mainnet" ? "unavailable" : "opt-in",
    }, { status: feedUnavailable ? 503 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      service: "radar-agent",
      status: "unconfigured",
      error: error instanceof Error ? error.message : "invalid configuration",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

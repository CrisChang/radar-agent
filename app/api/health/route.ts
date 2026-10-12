import { NextRequest, NextResponse } from "next/server";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "@/lib/arc";
import { getLatestSignal } from "@/lib/signals";
import { currentPaymentStore, paymentStoreConfigured } from "@/lib/redis-payment-store";
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
    let storeStatus = paymentStoreConfigured() ? "not_probed" : "unconfigured";
    if (request.nextUrl.searchParams.get("store") === "1" && paymentStoreConfigured()) {
      try { await currentPaymentStore()!.ping(); storeStatus = "available"; }
      catch { storeStatus = "unavailable"; }
    }
    const storeUnavailable = request.nextUrl.searchParams.get("store") === "1" && storeStatus !== "available";
    const feedUnavailable = feed?.feed_status === "stale";
    return NextResponse.json({
      service: "radar-agent",
      status: feedUnavailable ? "feed_unavailable" : storeUnavailable ? "store_unavailable" : "configured",
      payment_acceptance: process.env.RADAR_ACCEPT_PAYMENTS === "true" ? "enabled" : "discovery_only",
      payment_store: { configured: paymentStoreConfigured(), status: storeStatus },
      pilot_one_query_cap: arc.mode === "mainnet" && paymentStoreConfigured(),
      pilot_buyer: getPilotBuyerAddress(),
      pilot_recipient_distinct: getPilotBuyerAddress().toLowerCase() !== getSellerAddress().toLowerCase(),
      network: arc.name,
      chain_id: arc.chainId,
      paid_endpoint: "/api/signals/latest",
      payment: requirements,
      ...(feed ? { feed: { status: feed.feed_status, source: feed.source, ts: feed.ts } } : {}),
      // Configuration is not proof of a completed mainnet payment.
      treasury_execution: arc.mode === "mainnet" ? "unavailable" : "opt-in",
    }, { status: feedUnavailable || storeUnavailable ? 503 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      service: "radar-agent",
      status: "unconfigured",
      error: error instanceof Error ? error.message : "invalid configuration",
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

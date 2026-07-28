import { NextRequest, NextResponse } from "next/server";
import {
  buildDemoSignal,
  getLatestSignal,
} from "@/lib/signals";
import { withGateway } from "@/lib/x402";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = async (request: NextRequest) => {
  const symbol = request.nextUrl.searchParams.get("symbol") ?? "ETH-USD";
  const demo = request.nextUrl.searchParams.get("demo");

  try {
    const signal =
      demo === "sharp_drop" &&
      process.env.RADAR_ALLOW_DEMO_SIGNALS === "true"
        ? buildDemoSignal(symbol)
        : await getLatestSignal(symbol);

    return NextResponse.json(signal, {
      headers: {
        "cache-control": "no-store",
        "x-radar-feed-status": signal.feed_status,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "invalid signal request",
      },
      { status: 400 },
    );
  }
};

const price = process.env.SIGNAL_PRICE_USDC ?? "0.001";

export const GET = withGateway(
  handler,
  price,
  "/api/signals/latest",
);


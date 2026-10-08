import { NextResponse } from "next/server";
import { getArcConfig } from "@/lib/arc";
import { buildPaymentRequirements } from "@/lib/x402";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const arc = getArcConfig();
    const requirements = buildPaymentRequirements(process.env.SIGNAL_PRICE_USDC ?? "0.001");
    return NextResponse.json({
      service: "radar-agent",
      status: "configured",
      network: arc.name,
      chain_id: arc.chainId,
      paid_endpoint: "/api/signals/latest",
      payment: requirements,
      // Configuration is not proof of a completed mainnet payment.
      treasury_execution: arc.mode === "mainnet" ? "unavailable" : "opt-in",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      service: "radar-agent",
      status: "unconfigured",
      error: error instanceof Error ? error.message : "invalid configuration",
    }, { status: 503 });
  }
}

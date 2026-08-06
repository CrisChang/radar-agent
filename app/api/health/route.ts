import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "radar-agent",
    status: "ok",
    network: "Arc Testnet",
    chainId: 5042002,
    paid_endpoint: "/api/signals/latest",
    proof_endpoint: "/api/proof",
    deployment: "final-submission",
  });
}

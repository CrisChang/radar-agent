import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "radar-agent",
    status: "ok",
    network: "Arc Testnet",
    paid_endpoint: "/api/signals/latest",
  });
}


import { NextResponse } from "next/server";
import { VERIFIED_ARC_PROOF } from "@/lib/proof";

export function GET() {
  return NextResponse.json({
    service: "radar-agent",
    proofType: "recorded_verified_execution",
    disclaimer:
      "This endpoint replays a previously verified Arc Testnet execution and never broadcasts a new transaction.",
    proof: VERIFIED_ARC_PROOF,
  });
}


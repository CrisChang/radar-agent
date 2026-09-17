import { NextResponse } from "next/server";
import { getArcNetwork } from "@/lib/network";
import { currentPaymentDatabase } from "@/lib/payment-context";

export const dynamic = "force-dynamic";

export async function GET() {
  let network;
  try { network = getArcNetwork(); } catch {
    return NextResponse.json({ service: "radar-agent", status: "invalid_network" }, { status: 503 });
  }
  const database = currentPaymentDatabase();
  let databaseStatus = "missing";
  if (database) {
    try {
      // Schema/access check without retrieving or exposing any payment rows.
      await database.withSession("first-primary").prepare("SELECT payment_key FROM payment_receipts LIMIT 0").bind().first();
      databaseStatus = "schema_read_verified";
    } catch { databaseStatus = "unavailable_or_unmigrated"; }
  }
  return NextResponse.json({
    service: "radar-agent",
    status: databaseStatus === "schema_read_verified" ? "ok" : "degraded",
    network: network.name,
    chainId: network.chainId,
    paid_endpoint: "/api/signals/latest",
    proof_endpoint: "/api/proof",
    openapi_endpoint: "/api/openapi",
    deployment: process.env.RADAR_ACCEPT_PAYMENTS === "true" ? "integration-hardening" : "discovery-only",
    mainnet_execution_enabled: false,
    payment_execution: network.chainId === 5042 ? "blocked" : process.env.RADAR_ACCEPT_PAYMENTS !== "true" ? "disabled" : databaseStatus === "schema_read_verified" ? "testnet_only" : "blocked_missing_store",
    durable_payment_store: databaseStatus,
    proof_scope: "historical_testnet_fixture_replay",
  }, { status: databaseStatus === "schema_read_verified" ? 200 : 503, headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getArcNetwork } from "@/lib/network";
import { currentPaymentStore } from "@/lib/payment-context";

export const dynamic = "force-dynamic";

export function GET() {
  let network;
  try { network = getArcNetwork(); } catch {
    return NextResponse.json({ service: "radar-agent", status: "invalid_network" }, { status: 503 });
  }
  return NextResponse.json({
    service: "radar-agent",
    status: "ok",
    network: network.name,
    chainId: network.chainId,
    paid_endpoint: "/api/signals/latest",
    proof_endpoint: "/api/proof",
    openapi_endpoint: "/api/openapi",
    deployment: "integration-hardening",
    mainnet_execution_enabled: false,
    payment_execution: network.chainId === 5042 ? "blocked" : currentPaymentStore() ? "testnet_only" : "blocked_missing_store",
    durable_payment_store: currentPaymentStore() ? "binding_present_not_database_health_proof" : "missing",
    proof_scope: "historical_testnet_fixture_replay",
  });
}

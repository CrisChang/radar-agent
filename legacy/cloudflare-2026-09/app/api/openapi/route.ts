import { NextResponse } from "next/server";
import { buildOpenApi } from "@/lib/openapi";

export const dynamic = "force-dynamic";
export function GET() {
  try {
    return NextResponse.json(buildOpenApi(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "invalid network configuration" }, { status: 503 });
  }
}

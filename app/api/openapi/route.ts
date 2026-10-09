import { NextRequest, NextResponse } from "next/server";
import { openapiDocument } from "@/lib/openapi";
import { getResourceUrl } from "@/lib/x402";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return NextResponse.json(openapiDocument(new URL(getResourceUrl(request)).origin), { headers: { "cache-control": "no-store" } });
}

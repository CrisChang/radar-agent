import { NextRequest } from "next/server";
import { validationRecovery } from "@/lib/validation-recovery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) { return validationRecovery(request); }

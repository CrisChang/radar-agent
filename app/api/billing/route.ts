import { billingHandler } from "@/lib/billing-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const GET = billingHandler();

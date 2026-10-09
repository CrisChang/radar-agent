import { NextRequest, NextResponse } from "next/server";
import { getArcConfig } from "@/lib/arc";
import { authenticateBilling, UUID_PATTERN } from "@/lib/billing-auth";
import { billFromRecord, billsCsv } from "@/lib/billing";
import { currentPaymentStore } from "@/lib/redis-payment-store";
import { paymentRequestKey, type BillingStore } from "@/lib/payment-store";
import { getResourceUrl } from "@/lib/x402";

const headers = { "cache-control": "no-store", "vary": "x-radar-wallet, x-radar-auth-signature, x-radar-auth-timestamp" };

export function billingHandler(storeFactory: () => BillingStore | undefined = currentPaymentStore) {
  return async (request: NextRequest) => {
    let wallet: string;
    const arc = getArcConfig();
    try { wallet = await authenticateBilling(request, getResourceUrl(request), arc.network); }
    catch { return NextResponse.json({ error: "A valid, unexpired wallet read signature is required" }, { status: 401, headers }); }
    const query = request.nextUrl.searchParams;
    const requestId = query.get("request_id");
    const limit = query.get("limit") ?? "50";
    if ([...query.keys()].some(key => !["request_id", "limit", "format"].includes(key)) ||
        (requestId !== null && !UUID_PATTERN.test(requestId)) || !/^[1-9]\d?$|^100$/.test(limit) ||
        (query.has("format") && query.get("format") !== "csv")) {
      return NextResponse.json({ error: "Use a UUID request_id, limit 1 to 100 and optional format=csv" }, { status: 400, headers });
    }
    try {
      const store = storeFactory();
      if (!store) return NextResponse.json({ error: "Durable billing store is not configured" }, { status: 503, headers });
      const record = requestId ? await store.findByRequest(paymentRequestKey(arc.network, arc.gatewayWallet, wallet, requestId.toLowerCase())) : null;
      if (requestId && (!record || record.authorization?.payer.toLowerCase() !== wallet)) {
        return NextResponse.json({ error: "Receipt not found for this wallet" }, { status: 404, headers });
      }
      const records = requestId ? [record!] : await store.listForPayer(wallet, Number(limit));
      if (records.some(item => item.authorization?.payer.toLowerCase() !== wallet)) throw new Error("Billing scope conflict");
      const bills = records.map(billFromRecord);
      if (query.get("format") === "csv") return new NextResponse(billsCsv(bills), { headers: { ...headers,
        "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="radar-agent-bills.csv"' } });
      return NextResponse.json({ network: arc.network, wallet, bills,
        note: "Gateway acceptance is not independent onchain confirmation. Never automatically repay a pending or unknown request." }, { headers });
    } catch {
      return NextResponse.json({ error: "Billing is temporarily unavailable; do not retry a payment to repair a missing receipt" }, { status: 503, headers });
    }
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { billingHandler } from "../lib/billing-route";
import { billingMessage } from "../lib/billing-auth";
import { billFromRecord } from "../lib/billing";
import { encodeProtocolJson } from "../lib/protocol";
import type { BillingStore, PaymentRecord } from "../lib/payment-store";
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const other = privateKeyToAccount(`0x${"02".repeat(32)}`);
process.env.ARC_NETWORK = "mainnet";
process.env.PUBLIC_BASE_URL = "https://radar.example";
process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
const id = "11111111-1111-4111-8111-111111111111";
function record(payer = account.address.toLowerCase(), state: PaymentRecord["state"] = "accepted"): PaymentRecord {
  return { paymentKey: "a".repeat(64), requestKey: "b".repeat(64), requestId: id, fingerprint: "f".repeat(64), state,
    createdAt: "2026-10-09T01:00:00.000Z", authorization: { payer, nonce: "private-test-nonce", network: "eip155:5042", gatewayWallet: "test-contract" },
    terms: { amountAtomic: "1000", asset: "USDC-test-asset", payTo: process.env.SELLER_ADDRESS! },
    response: { status: 200, body: JSON.stringify({ signal_id: "explicit-synthetic-signal" }), headers: {
      "payment-response": encodeProtocolJson({ success: true, transaction: "explicit-test-gateway-reference" }), "x-radar-response-sha256": "d".repeat(64) } } };
}
function store(item = record()): BillingStore {
  return { async find() { return item; }, async claim() { return true; }, async transition() {}, async ping() {},
    async listForPayer(wallet) { assert.equal(wallet, account.address.toLowerCase()); return [item]; }, async findByRequest() { return item; } };
}
async function request(path = "/api/billing?limit=50", options: { timestamp?: string; signedUrl?: string; signedNetwork?: string } = {}) {
  const url = `https://radar.example${path}`;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = await account.signMessage({ message: billingMessage({ url: options.signedUrl ?? url,
    network: options.signedNetwork ?? "eip155:5042", wallet: account.address, timestamp }) });
  return new NextRequest(url, { headers: { "x-radar-wallet": account.address, "x-radar-auth-timestamp": timestamp, "x-radar-auth-signature": signature } });
}
test("billing rejects missing, expired, altered-origin and altered-network signatures before storage", async () => {
  let touched = false;
  const get = billingHandler(() => { touched = true; throw new Error("must not read storage"); });
  for (const req of [new NextRequest("https://radar.example/api/billing"), await request(undefined, { timestamp: "1600000000" }),
    await request(undefined, { signedUrl: "https://other.example/api/billing?limit=50" }), await request(undefined, { signedNetwork: "eip155:5042002" })]) {
    assert.equal((await get(req)).status, 401);
  }
  assert.equal(touched, false);
});
test("billing returns the signing wallet's amount and receipt without authorization details", async () => {
  const response = await billingHandler(() => store())(await request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.bills[0].amount_usdc, "0.001000");
  assert.equal(body.bills[0].payment.onchainVerified, false);
  assert.equal(body.bills[0].signal_id, "explicit-synthetic-signal");
  assert.doesNotMatch(JSON.stringify(body), /private-test-nonce|fingerprint|signature/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("a receipt owned by another wallet is never returned or listed", async () => {
  const get = billingHandler(() => store(record(other.address.toLowerCase())));
  assert.equal((await get(await request(`/api/billing?request_id=${id}`))).status, 404);
  const list = await get(await request());
  assert.equal(list.status, 503);
  assert.doesNotMatch(await list.text(), new RegExp(other.address, "i"));
});
test("unknown payments cannot expose prepared signal content or a success reference", () => {
  const bill = billFromRecord(record(account.address.toLowerCase(), "unknown"));
  assert.equal(bill.signal_id, null);
  assert.equal(bill.response_sha256, null);
  assert.equal(bill.payment.reference, null);
  assert.equal(bill.payment_status, "pending_or_unknown_do_not_repay");
});
test("CSV export is authenticated and invalid query ranges are rejected", async () => {
  const get = billingHandler(() => store());
  const csv = await get(await request("/api/billing?format=csv"));
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type")!, /text\/csv/);
  assert.match(await csv.text(), /0\.001000/);
  for (const path of ["/api/billing?limit=0", "/api/billing?limit=101", "/api/billing?request_id=bad", "/api/billing?wallet=other"]) {
    assert.equal((await get(await request(path))).status, 400);
  }
});

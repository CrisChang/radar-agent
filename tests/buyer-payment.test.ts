import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { getArcConfig } from "../lib/arc";
import { attachSignalPaymentPolicy, validateSignalPayment } from "../lib/buyer-payment";
import { DisciplineEngine } from "../lib/discipline";

const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
const seller = "0x1111111111111111111111111111111111111111";
function requirements(amount = "1000") {
  return { scheme: "exact", network: arc.network, asset: arc.usdc, amount,
    payTo: seller, maxTimeoutSeconds: 604900,
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: arc.gatewayWallet } };
}

test("price and destination policy rejects altered quotes", () => {
  assert.throws(() => validateSignalPayment(null, arc, seller, "0.001"));
  assert.throws(() => validateSignalPayment({ amount: "1000" }, arc, seller, "0.001"));
  assert.equal(validateSignalPayment(requirements(), arc, seller, "0.001"), 0.001);
  for (const altered of [
    { ...requirements(), amount: "1001" },
    { ...requirements(), network: "eip155:5042002" },
    { ...requirements(), payTo: "0x2222222222222222222222222222222222222222" },
    { ...requirements(), asset: seller },
    { ...requirements(), extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: seller } },
  ]) assert.throws(() => validateSignalPayment(altered, arc, seller, "0.001"));
});

test("real Gateway client rechecks the paid request before signing and sending", async () => {
  const dir = mkdtempSync(join(tmpdir(), "radar-payment-"));
  const discipline = new DisciplineEngine(join(dir, "state.json"), join(dir, "audit.jsonl"), { data: 0.001, treasury: 0 });
  const gateway = new GatewayClient({ chain: "arc", privateKey: `0x${"01".repeat(32)}` });
  attachSignalPaymentPolicy(gateway, discipline, arc, seller, "0.001");
  const previousFetch = globalThis.fetch;
  let amount = "1000";
  let signatures = 0;
  let paidRequests = 0;
  gateway.onAfterPaymentCreation(async () => { signatures++; });
  globalThis.fetch = async (_input, options) => {
    if (new Headers(options?.headers).has("payment-signature")) {
      paidRequests++;
      throw new Error("simulated connection lost after sending signed payment");
    }
    return new Response("{}", { status: 402, headers: {
      "payment-required": Buffer.from(JSON.stringify({ x402Version: 2,
        resource: { url: "https://seller.example/signal", description: "signal", mimeType: "application/json" },
        accepts: [requirements(amount)] })).toString("base64"),
    } });
  };
  try {
    assert.equal((await gateway.supports("https://seller.example/signal")).supported, true);
    amount = "2000";
    await assert.rejects(() => gateway.pay("https://seller.example/signal"));
    assert.equal(signatures, 0);
    assert.equal(paidRequests, 0);
    amount = "1000";
    await assert.rejects(() => gateway.pay("https://seller.example/signal"));
    assert.equal(signatures, 1);
    assert.equal(paidRequests, 1);
    // Lost response still consumes the authorization budget. Retrying cannot
    // produce another signature beyond the cap.
    await assert.rejects(() => gateway.pay("https://seller.example/signal"));
    assert.equal(signatures, 1);
    assert.equal(paidRequests, 1);
  } finally {
    globalThis.fetch = previousFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

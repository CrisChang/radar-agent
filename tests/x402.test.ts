import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentRequirements } from "../lib/x402";
import { getResourceUrl } from "../lib/x402";
import { withGateway } from "../lib/x402";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { NextRequest, NextResponse } from "next/server";

test("advertises a Gateway-compatible authorization validity window", () => {
  const previousSellerAddress = process.env.SELLER_ADDRESS;
  process.env.SELLER_ADDRESS =
    "0x1111111111111111111111111111111111111111";

  try {
    const requirements = buildPaymentRequirements("0.001");

    assert.equal(requirements.maxTimeoutSeconds, 604_900);
    assert.ok(requirements.maxTimeoutSeconds >= 7 * 24 * 60 * 60);
  } finally {
    if (previousSellerAddress === undefined) {
      delete process.env.SELLER_ADDRESS;
    } else {
      process.env.SELLER_ADDRESS = previousSellerAddress;
    }
  }
});

test("quote resource uses the requested host instead of Next's internal localhost", () => {
  const old = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  try {
    const request = new NextRequest("http://localhost:3001/api/signals/latest?symbol=BTC-USD", { headers: { host: "127.0.0.1:3001" } });
    assert.equal(getResourceUrl(request), "http://127.0.0.1:3001/api/signals/latest?symbol=BTC-USD");
  } finally {
    if (old === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = old;
  }
});

test("public HTTPS origin preserves path and query through a reverse proxy", () => {
  const old = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = "https://radar.example";
  try {
    const request = new NextRequest("http://localhost:3000/api/signals/latest?symbol=ETH-USD");
    assert.equal(getResourceUrl(request), "https://radar.example/api/signals/latest?symbol=ETH-USD");
    process.env.PUBLIC_BASE_URL = "https://user:password@radar.example";
    assert.throws(() => getResourceUrl(request));
  } finally {
    if (old === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = old;
  }
});

test("mainnet seller advertises the mainnet chain and Gateway wallet", () => {
  const previous = { network: process.env.ARC_NETWORK, seller: process.env.SELLER_ADDRESS };
  process.env.ARC_NETWORK = "mainnet";
  process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
  try {
    const quote = buildPaymentRequirements("0.001");
    assert.equal(quote.network, "eip155:5042");
    assert.equal(quote.amount, "1000");
    assert.equal(quote.extra.verifyingContract, "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE");
    assert.throws(() => buildPaymentRequirements("0.0000001"));
  } finally {
    if (previous.network === undefined) delete process.env.ARC_NETWORK;
    else process.env.ARC_NETWORK = previous.network;
    if (previous.seller === undefined) delete process.env.SELLER_ADDRESS;
    else process.env.SELLER_ADDRESS = previous.seller;
  }
});

test("a failed protected handler never settles the verified payment", async () => {
  const originalVerify = BatchFacilitatorClient.prototype.verify;
  const originalSettle = BatchFacilitatorClient.prototype.settle;
  const originalSeller = process.env.SELLER_ADDRESS;
  let settlements = 0;
  process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
  BatchFacilitatorClient.prototype.verify = async () => ({ isValid: true });
  BatchFacilitatorClient.prototype.settle = async () => {
    settlements++;
    return { success: true, transaction: "test", network: "eip155:5042002" };
  };
  try {
    const handler = withGateway(async () => NextResponse.json({ error: "feed unavailable" }, { status: 503 }), "0.001", "/api/signals/latest");
    const response = await handler(new NextRequest("http://localhost/api/signals/latest", {
      headers: { "payment-signature": Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64") },
    }));
    assert.equal(response.status, 503);
    assert.equal(settlements, 0);
  } finally {
    BatchFacilitatorClient.prototype.verify = originalVerify;
    BatchFacilitatorClient.prototype.settle = originalSettle;
    if (originalSeller === undefined) delete process.env.SELLER_ADDRESS;
    else process.env.SELLER_ADDRESS = originalSeller;
  }
});

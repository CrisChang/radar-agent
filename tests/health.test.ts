import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/health/route";

function configureSeller() {
  const previous = { network: process.env.ARC_NETWORK, seller: process.env.SELLER_ADDRESS };
  process.env.ARC_NETWORK = "mainnet";
  process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
  return () => {
    if (previous.network === undefined) delete process.env.ARC_NETWORK;
    else process.env.ARC_NETWORK = previous.network;
    if (previous.seller === undefined) delete process.env.SELLER_ADDRESS;
    else process.env.SELLER_ADDRESS = previous.seller;
  };
}

test("ordinary health checks do not fetch the market feed", async () => {
  const restore = configureSeller();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected feed request"); };
  try {
    const response = await GET(new NextRequest("https://radar.example/api/health"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.chain_id, 5042);
    assert.equal(body.status, "configured");
    assert.equal(body.feed, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("deployment feed probe reports freshness without exposing a paid signal", async () => {
  const restore = configureSeller();
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  globalThis.fetch = async () => Response.json([0, 1, 2].map(i => [now - i * 60, 90, 110, 100, 101, 1]));
  try {
    const response = await GET(new NextRequest("https://radar.example/api/health?feed=1"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.feed.status, "live");
    assert.deepEqual(Object.keys(body.feed).sort(), ["source", "status", "ts"]);
    assert.equal(body.feed.price, undefined);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("deployment feed probe fails when egress is unavailable", async () => {
  const restore = configureSeller();
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; throw new Error("connection timeout"); };
  try {
    const response = await GET(new NextRequest("https://radar.example/api/health?feed=1"));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, "feed_unavailable");
    assert.equal(body.feed.status, "stale");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

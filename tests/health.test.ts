import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/health/route";

test("storage readiness fails closed when no durable store is configured", async () => {
  const keys = ["SELLER_ADDRESS", "ARC_NETWORK", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "RADAR_ACCEPT_PAYMENTS"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
  process.env.ARC_NETWORK = "mainnet";
  try {
    const ordinary = await GET(new NextRequest("https://radar.example/api/health"));
    assert.equal(ordinary.status, 200);
    const readiness = await GET(new NextRequest("https://radar.example/api/health?store=1"));
    assert.equal(readiness.status, 503);
    const body = await readiness.json();
    assert.equal(body.status, "store_unavailable");
    assert.deepEqual(body.payment_store, { configured: false, status: "unconfigured" });
    assert.equal(body.payment_acceptance, "discovery_only");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

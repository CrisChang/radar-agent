import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentRequirements } from "../lib/x402";

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

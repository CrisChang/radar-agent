/**
 * Adapted from circlefin/arc-nanopayments (Apache-2.0).
 * The payment requirements and facilitator flow intentionally match Circle's
 * official starter kit.
 */

import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { NextRequest, NextResponse } from "next/server";

const ARC_TESTNET_NETWORK = "eip155:5042002";
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_GATEWAY_WALLET =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
// Gateway nanopayment authorizations need at least seven days of validity.
// Keep the small buffer used by Circle's current seller quickstart.
const GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS = 604_900;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const facilitator = new BatchFacilitatorClient();

interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

function sellerAddress(): `0x${string}` {
  const address = process.env.SELLER_ADDRESS;
  if (!address || !ADDRESS_PATTERN.test(address)) {
    throw new Error("SELLER_ADDRESS must be a valid Arc Testnet EVM address");
  }
  return address as `0x${string}`;
}

export function buildPaymentRequirements(priceUsdc: string) {
  const numericPrice = Number(priceUsdc);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error(`invalid x402 price: ${priceUsdc}`);
  }

  return {
    scheme: "exact" as const,
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: Math.round(numericPrice * 1_000_000).toString(),
    payTo: sellerAddress(),
    maxTimeoutSeconds: GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET,
    },
  };
}

async function recordPayment(event: Record<string, unknown>): Promise<void> {
  const path = process.env.PAYMENT_AUDIT_PATH;
  if (!path) return;
  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(
      path,
      `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`,
    );
  } catch (error) {
    console.error("[x402] unable to append optional payment audit:", error);
  }
}

export function withGateway(
  handler: (request: NextRequest) => Promise<NextResponse>,
  priceUsdc: string,
  endpoint: string,
) {
  return async (request: NextRequest) => {
    let requirements: ReturnType<typeof buildPaymentRequirements>;
    try {
      requirements = buildPaymentRequirements(priceUsdc);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "seller is not configured",
        },
        { status: 503 },
      );
    }

    const signature = request.headers.get("payment-signature");
    if (!signature) {
      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: endpoint,
          description: "Radar Agent real-time market signal",
          mimeType: "application/json",
        },
        accepts: [requirements],
      };
      return new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "content-type": "application/json",
          "payment-required": Buffer.from(
            JSON.stringify(paymentRequired),
          ).toString("base64"),
        },
      });
    }

    try {
      const paymentPayload = JSON.parse(
        Buffer.from(signature, "base64").toString("utf8"),
      ) as PaymentPayload;
      const verification = await facilitator.verify(
        paymentPayload,
        requirements,
      );
      if (!verification.isValid) {
        return NextResponse.json(
          {
            error: "payment verification failed",
            reason: verification.invalidReason,
          },
          { status: 402 },
        );
      }

      const settlement = await facilitator.settle(
        paymentPayload,
        requirements,
      );
      if (!settlement.success) {
        return NextResponse.json(
          {
            error: "payment settlement failed",
            reason: settlement.errorReason,
          },
          { status: 402 },
        );
      }

      const payer = settlement.payer ?? verification.payer ?? "unknown";
      const amountUsdc = Number(requirements.amount) / 1_000_000;
      await recordPayment({
        endpoint,
        payer,
        amount_usdc: amountUsdc,
        network: requirements.network,
        transaction: settlement.transaction ?? null,
      });

      const response = await handler(request);
      response.headers.set(
        "payment-response",
        Buffer.from(
          JSON.stringify({
            success: true,
            transaction: settlement.transaction,
            network: requirements.network,
            payer,
          }),
        ).toString("base64"),
      );
      return response;
    } catch (error) {
      console.error("[x402] payment processing error:", error);
      return NextResponse.json(
        {
          error: "payment processing error",
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  };
}

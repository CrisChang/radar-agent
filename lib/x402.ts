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
import { getArcConfig, getSellerAddress, parseUsdcAtomic } from "./arc";

// Gateway nanopayment authorizations need at least seven days of validity.
// Keep the small buffer used by Circle's current seller quickstart.
const GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS = 604_900;

interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export function buildPaymentRequirements(priceUsdc: string) {
  const arc = getArcConfig();

  return {
    scheme: "exact" as const,
    network: arc.network,
    asset: arc.usdc,
    amount: parseUsdcAtomic(priceUsdc).toString(),
    payTo: getSellerAddress(),
    maxTimeoutSeconds: GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: arc.gatewayWallet,
    },
  };
}

export function getResourceUrl(request: NextRequest): string {
  const base = new URL(process.env.PUBLIC_BASE_URL ?? request.url);
  if (base.username || base.password || !["https:", "http:"].includes(base.protocol)) {
    throw new Error("PUBLIC_BASE_URL must be an HTTP(S) origin without credentials");
  }
  // Next's internal request URL may use localhost behind a reverse proxy.
  // A production deployment should pin PUBLIC_BASE_URL to its HTTPS origin.
  if (!process.env.PUBLIC_BASE_URL && request.headers.get("host")) {
    base.host = request.headers.get("host")!;
  }
  return new URL(request.nextUrl.pathname + request.nextUrl.search, base.origin).toString();
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
    let resourceUrl: string;
    try {
      requirements = buildPaymentRequirements(priceUsdc);
      resourceUrl = getResourceUrl(request);
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
          url: resourceUrl,
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
      const facilitator = new BatchFacilitatorClient({
        url: getArcConfig().facilitatorUrl,
      });
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

      // Validate/prepare the resource before charging. Invalid parameters or
      // an unavailable feed must not result in a successful payment.
      const response = await handler(request);
      if (!response.ok) return response;

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

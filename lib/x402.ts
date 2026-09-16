/**
 * Adapted from circlefin/arc-nanopayments (Apache-2.0).
 * The payment requirements and facilitator flow intentionally match Circle's
 * official starter kit.
 */

import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { NextRequest, NextResponse } from "next/server";
import { assertExecutionNetwork, getArcNetwork, usdcAtomic } from "./network";
import { classifyPaymentReference, validateOffer } from "./agent-contract";

// Gateway nanopayment authorizations need at least seven days of validity.
// Keep the small buffer used by Circle's current seller quickstart.
const GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS = 604_900;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;


interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description: string; mimeType: string };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

function sellerAddress(): `0x${string}` {
  const address = process.env.SELLER_ADDRESS;
  if (!address || !ADDRESS_PATTERN.test(address) || /^0x0{40}$/.test(address)) {
    throw new Error("SELLER_ADDRESS must be a valid nonzero EVM address");
  }
  return address as `0x${string}`;
}

export function buildPaymentRequirements(priceUsdc: string) {
  const network = getArcNetwork();

  return {
    scheme: "exact" as const,
    network: network.caip2,
    asset: network.usdc,
    amount: usdcAtomic(priceUsdc),
    payTo: sellerAddress(),
    maxTimeoutSeconds: GATEWAY_AUTHORIZATION_TIMEOUT_SECONDS,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: network.gatewayWallet,
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
  dependencies: { facilitator?: Pick<BatchFacilitatorClient, "verify" | "settle"> } = {},
) {
  return async (request: NextRequest) => {
    const requestId = randomUUID();
    let requirements: ReturnType<typeof buildPaymentRequirements>;
    try {
      assertExecutionNetwork(getArcNetwork());
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

    let paymentPayload: PaymentPayload;
    try {
      if (signature.length > 16_384) throw new Error("payment header too large");
      paymentPayload = JSON.parse(
        Buffer.from(signature, "base64").toString("utf8"),
      ) as PaymentPayload;
      if (!paymentPayload.payload || typeof paymentPayload.payload !== "object") throw new Error("invalid payload");
      const offer = validateOffer({ x402Version: paymentPayload.x402Version, accepts: [paymentPayload.accepted] }, getArcNetwork(), requirements.amount);
      if (offer.amountAtomic !== requirements.amount || offer.payTo.toLowerCase() !== requirements.payTo.toLowerCase()) throw new Error("payment terms changed");
    } catch {
      return NextResponse.json({ error: "invalid payment payload", request_id: requestId }, { status: 400 });
    }

    let settlementAttempted = false;
    try {
      const facilitator = dependencies.facilitator ?? new BatchFacilitatorClient({ url: getArcNetwork().facilitatorUrl });
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

      // Prepare content before accepting payment: invalid/stale data is not a
      // successful paid delivery. This handler must remain read-only.
      const response = await handler(request);
      if (!response.ok) return response;
      const outputHash = createHash("sha256").update(await response.clone().text()).digest("hex");
      settlementAttempted = true;
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
        request_id: requestId,
        payer,
        amount_usdc: amountUsdc,
        network: requirements.network,
        payment: classifyPaymentReference(settlement.transaction),
        payment_status: "gateway_accepted",
        delivery_status: "response_prepared",
        response_sha256: outputHash,
      });

      response.headers.set("x-radar-request-id", requestId);
      response.headers.set("x-radar-response-sha256", outputHash);
      response.headers.set("x-radar-payment-state", "gateway_accepted_not_onchain_verified");
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
      // Do not leak provider errors, signatures or payment authorization data.
      console.error("[x402] request failed", { requestId, settlementAttempted });
      await recordPayment({ endpoint, request_id: requestId,
        payment_status: settlementAttempted ? "unknown_do_not_repay" : "not_settled",
        delivery_status: "not_served", network: requirements.network });
      return NextResponse.json(
        {
          error: "payment processing error",
          request_id: requestId,
          payment_status: settlementAttempted ? "unknown_do_not_repay" : "not_settled",
          retry_safe: !settlementAttempted,
        },
        { status: 502 },
      );
    }
  };
}

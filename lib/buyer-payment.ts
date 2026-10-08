import { privateKeyToAccount } from "viem/accounts";
import type { GatewayClient } from "@circle-fin/x402-batching/client";
import type { HookPaymentRequirements } from "@circle-fin/x402-batching";
import type { ArcConfig } from "./arc";
import { parseUsdcAtomic } from "./arc";
import type { DisciplineEngine } from "./discipline";

export function validateBuyerSigner(
  privateKey: string,
  expectedAddress: string | undefined,
  arc: ArcConfig,
): `0x${string}` {
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("BUYER_PRIVATE_KEY must be a valid signing key configured locally");
  }
  if (arc.mode === "mainnet" && !expectedAddress) {
    throw new Error("BUYER_ADDRESS must pin the approved mainnet test wallet");
  }
  if (expectedAddress && (!/^0x[a-fA-F0-9]{40}$/.test(expectedAddress) || /^0x0{40}$/i.test(expectedAddress))) {
    throw new Error("BUYER_ADDRESS must be a nonzero EVM address");
  }
  let address: `0x${string}`;
  try {
    address = privateKeyToAccount(privateKey as `0x${string}`).address;
  } catch {
    throw new Error("BUYER_PRIVATE_KEY must be a valid signing key configured locally");
  }
  if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Configured signing key does not match the approved BUYER_ADDRESS");
  }
  return address;
}

export function validateSignalPayment(
  rawRequirements: unknown,
  arc: ArcConfig,
  expectedSeller: string,
  maximumPrice: string,
): number {
  if (!rawRequirements || typeof rawRequirements !== "object") {
    throw new Error("seller omitted payment requirements");
  }
  const requirements = rawRequirements as Partial<HookPaymentRequirements>;
  if (![requirements.scheme, requirements.network, requirements.asset,
    requirements.payTo, requirements.amount].every(value => typeof value === "string")) {
    throw new Error("seller advertised malformed payment requirements");
  }
  if (
    requirements.scheme !== "exact" ||
    requirements.network !== arc.network ||
    requirements.asset!.toLowerCase() !== arc.usdc.toLowerCase() ||
    requirements.payTo!.toLowerCase() !== expectedSeller.toLowerCase() ||
    requirements.extra?.name !== "GatewayWalletBatched" ||
    requirements.extra?.version !== "1" ||
    String(requirements.extra?.verifyingContract).toLowerCase() !== arc.gatewayWallet.toLowerCase()
  ) {
    throw new Error("seller payment network, asset, recipient or Gateway contract does not match configuration");
  }
  if (!/^[1-9]\d*$/.test(requirements.amount!)) {
    throw new Error("seller advertised an invalid x402 amount");
  }
  const atomic = BigInt(requirements.amount!);
  if (atomic > parseUsdcAtomic(maximumPrice)) {
    throw new Error(`seller amount exceeds the ${maximumPrice} USDC per-query maximum`);
  }
  return Number(atomic) / 1_000_000;
}

export function attachSignalPaymentPolicy(
  gateway: GatewayClient,
  discipline: DisciplineEngine,
  arc: ArcConfig,
  seller: string,
  maximumPrice: string,
) {
  gateway.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const amount = validateSignalPayment(selectedRequirements, arc, seller, maximumPrice);
    discipline.preflight();
    discipline.authorizeSpend("data", amount);
  });
  gateway.onAfterPaymentCreation(async ({ selectedRequirements }) => {
    const amount = validateSignalPayment(selectedRequirements, arc, seller, maximumPrice);
    // Reserve the budget once an authorization exists. A lost HTTP response
    // must not make an already signed payment disappear from the daily cap.
    discipline.recordSpend("data", amount);
    discipline.audit("payment_authorized", {
      amount_usdc: amount,
      network: arc.network,
      pay_to: seller,
    });
  });
}

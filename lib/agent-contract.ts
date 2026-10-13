import { getArcConfig, type ArcConfig } from "./arc";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as JsonObject;
}

export function validateOffer(raw: unknown, network: ArcConfig, maximumAtomic = "1000", maximumAuthorizationSeconds = 604_900) {
  const challenge = object(raw);
  if (challenge.x402Version !== 2 || !Array.isArray(challenge.accepts)) throw new Error("Unsupported x402 challenge");
  const maximum = BigInt(maximumAtomic);
  if (maximum <= 0n) throw new Error("Maximum price must be positive");
  for (const value of challenge.accepts) {
    const offer = object(value);
    if (offer.network !== network.network || offer.scheme !== "exact") continue;
    const extra = object(offer.extra);
    if (!Number.isInteger(maximumAuthorizationSeconds) || maximumAuthorizationSeconds < 604_800 || maximumAuthorizationSeconds > 608_400 || !Number.isInteger(offer.maxTimeoutSeconds) || Number(offer.maxTimeoutSeconds) < 604_800 || Number(offer.maxTimeoutSeconds) > maximumAuthorizationSeconds) throw new Error("Unsupported authorization validity window");
    if (String(offer.asset).toLowerCase() !== network.usdc.toLowerCase()) throw new Error("Wrong payment asset");
    if (extra.name !== "GatewayWalletBatched" || extra.version !== "1" ||
        String(extra.verifyingContract).toLowerCase() !== network.gatewayWallet.toLowerCase()) {
      throw new Error("Wrong Gateway authorization domain");
    }
    if (typeof offer.amount !== "string" || !/^[1-9]\d*$/.test(offer.amount) || BigInt(offer.amount) > maximum) throw new Error("Invalid or over-budget offer");
    if (typeof offer.payTo !== "string" || !/^0x[\da-fA-F]{40}$/.test(offer.payTo) || /^0x0{40}$/.test(offer.payTo)) throw new Error("Invalid seller address");
    return { network: network.network, amountAtomic: offer.amount, asset: network.usdc, payTo: offer.payTo };
  }
  throw new Error(`No accepted offer for ${network.network}; refusing cross-network fallback`);
}

export function networkForChainId(chainId: unknown): ArcConfig {
  if (chainId === 5042) return getArcConfig({ ARC_NETWORK: "mainnet" });
  if (chainId === 5042002) return getArcConfig({ ARC_NETWORK: "testnet" });
  throw new Error("Unknown Arc chain ID");
}

/** Recheck the fresh quote immediately before signing, not just at discovery. */
export function assertUnchangedOffer(
  selected: unknown,
  approved: ReturnType<typeof validateOffer>,
  network: ArcConfig,
  maximumAuthorizationSeconds = 604_900,
): void {
  const actual = validateOffer({ x402Version: 2, accepts: [selected] }, network, approved.amountAtomic, maximumAuthorizationSeconds);
  if (actual.amountAtomic !== approved.amountAtomic ||
      actual.payTo.toLowerCase() !== approved.payTo.toLowerCase()) {
    throw new Error("Seller changed the approved quote");
  }
}

/** This classifies an observation, not a proof of onchain settlement. */
export function classifyPaymentReference(reference: unknown) {
  return {
    reference: typeof reference === "string" ? reference : null,
    referenceKind: typeof reference === "string" && /^0x[\da-fA-F]{64}$/.test(reference)
      ? "unverified_transaction_hash" : "gateway_reference",
    onchainVerified: false,
  };
}

import { privateKeyToAccount } from "viem/accounts";
import type { BatchEvmScheme } from "@circle-fin/x402-batching/client";

type ParametersToSign = Parameters<ConstructorParameters<typeof BatchEvmScheme>[0]["signTypedData"]>[0];
/** Optional OWNER-RUN adapter. It is excluded from Vercel deployments.
 * Never send this environment variable to an assistant or store it in source.
 * This is a software policy, not a cryptographically restricted private key. */
export async function createSigner(options: { payer: string; seller: string }) {
  if (process.env.RADAR_VALIDATION_LOCAL_KEY_CONSENT !== "LOCAL_TEST_WALLET_ONLY") {
    throw new Error("Local key signing is opt-in. Choose the browser or explicitly configure this private local adapter yourself");
  }
  const key = process.env.RADAR_VALIDATION_PRIVATE_KEY;
  if (!key || !/^0x[\da-f]{64}$/i.test(key)) throw new Error("Configure the test wallet signing key privately on your own computer; never paste it into chat");
  let account;
  try { account = privateKeyToAccount(key as `0x${string}`); } catch { throw new Error("Local signing key is invalid"); }
  if (account.address.toLowerCase() !== options.payer.toLowerCase()) throw new Error("Local signer address differs from the pinned payer");
  const signer = account;
  return { address: signer.address, async signTypedData(params: ParametersToSign) {
    const amount = BigInt(String(params.message.value));
    if (params.domain.chainId !== 5042 || params.domain.name !== "GatewayWalletBatched" || params.domain.version !== "1" ||
        params.domain.verifyingContract.toLowerCase() !== "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee" ||
        params.primaryType !== "TransferWithAuthorization" || String(params.message.from).toLowerCase() !== options.payer.toLowerCase() ||
        String(params.message.to).toLowerCase() !== options.seller.toLowerCase() || amount < 1n || amount > 1000n) {
      throw new Error("Local signer rejected changed network, recipient, type or payment amount");
    }
    return signer.signTypedData(params);
  } };
}

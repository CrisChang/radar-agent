import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { getArcConfig, getSellerAddress } from "@/lib/arc";
import { allowanceQuote } from "@/lib/gateway-allowance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
  const arc = getArcConfig();
  if (arc.mode !== "mainnet" || wallet.toLowerCase() !== getSellerAddress().toLowerCase()) return NextResponse.json({ error: "Gateway allowance review is pinned to the approved pilot wallet" }, { status: 400 });
  try {
    const account = wallet as `0x${string}`;
    const client = createPublicClient({ transport: http(arc.rpcUrl, { timeout: 8_000, retryCount: 0 }) });
    const [chainId, allowance, nativeBalance, gasPrice] = await Promise.all([
      client.getChainId(), client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "allowance", args: [account, arc.gatewayWallet] }),
      client.getBalance({ address: account }), client.getGasPrice(),
    ]);
    const revokeEstimate = allowance > 0n ? await client.estimateContractGas({ account, address: arc.usdc, abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, 0n] }) : undefined;
    return NextResponse.json(allowanceQuote(arc, wallet, { chainId, allowance, nativeBalance, gasPrice, revokeEstimate }), { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Gateway allowance or bounded revoke simulation is unavailable. No transaction was attempted." }, { status: 503, headers: { "cache-control": "no-store" } }); }
}

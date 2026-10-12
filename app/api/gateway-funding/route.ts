import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { getArcConfig, getSellerAddress } from "@/lib/arc";
import { fundingQuote, gatewayDepositAbi, PILOT_DEPOSIT_ATOMIC } from "@/lib/gateway-funding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
  const arc = getArcConfig();
  if (arc.mode !== "mainnet" || wallet.toLowerCase() !== getSellerAddress().toLowerCase()) {
    return NextResponse.json({ error: "Gateway funding is pinned to the approved mainnet pilot wallet" }, { status: 400 });
  }
  const account = wallet as `0x${string}`;
  try {
    const client = createPublicClient({ transport: http(arc.rpcUrl, { timeout: 8_000, retryCount: 0 }) });
    const [chainId, nativeBalance, allowance, gasPrice] = await Promise.all([
      client.getChainId(), client.getBalance({ address: account }),
      client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "allowance", args: [account, arc.gatewayWallet] }),
      client.getGasPrice(),
    ]);
    const approvalNeeded = allowance < PILOT_DEPOSIT_ATOMIC;
    const estimate = approvalNeeded
      ? await client.estimateContractGas({ account, address: arc.usdc, abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, PILOT_DEPOSIT_ATOMIC] })
      : await client.estimateContractGas({ account, address: arc.gatewayWallet, abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, PILOT_DEPOSIT_ATOMIC] });
    return NextResponse.json(fundingQuote(arc, wallet, { chainId, nativeBalance, allowance, gasPrice,
      approvalEstimate: approvalNeeded ? estimate : undefined, depositEstimate: approvalNeeded ? undefined : estimate }),
      { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Gateway simulation or gas quote is unavailable or exceeds the cap. No transaction was attempted." },
    { status: 503, headers: { "cache-control": "no-store" } }); }
}

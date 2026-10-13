import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { getArcConfig, getPilotBuyerAddress } from "./arc";
import { validationStore } from "./validation-store";
import { fundingQuote, gatewayDepositAbi } from "./gateway-funding";
export async function validationFunding(request: NextRequest) {
  const arc = getArcConfig(), payer = getPilotBuyerAddress();
  if (arc.mode !== "mainnet" || [...request.nextUrl.searchParams.keys()].length) return NextResponse.json({ error: "Campaign funding is fixed by the server budget" }, { status: 400 });
  try {
    const state = await validationStore()?.state();
    if (!state || state.halted || state.verifiedCount !== state.reservedCount || state.verifiedCount < 10) throw new Error("Reconcile the first ten payments before funding the remaining stages");
    const balanceResponse = await fetch(`${arc.facilitatorUrl}/v1/balances`, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "USDC", sources: [{ depositor: payer, domain: 26 }] }) });
    const raw = (await balanceResponse.json() as { balances?: { balance?: string }[] }).balances?.[0]?.balance;
    if (!balanceResponse.ok || typeof raw !== "string" || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(raw)) throw new Error("Gateway balance unverified");
    const [whole, fraction = ""] = raw.split(".");
    const available = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    const amount = 232_600n - BigInt(state.reservedAtomic) - available;
    if (amount <= 0n || amount > 223_600n) throw new Error("No top-up needed or funding gap exceeds the reviewed 0.2236 USDC maximum");
    const client = createPublicClient({ transport: http(arc.rpcUrl, { timeout: 8000, retryCount: 0 }) });
    const [chainId, nativeBalance, allowance, gasPrice] = await Promise.all([client.getChainId(), client.getBalance({ address: payer }),
      client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "allowance", args: [payer, arc.gatewayWallet] }), client.getGasPrice()]);
    const approvalNeeded = allowance < amount;
    const estimate = approvalNeeded ? await client.estimateContractGas({ account: payer, address: arc.usdc, abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, amount] })
      : await client.estimateContractGas({ account: payer, address: arc.gatewayWallet, abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, amount] });
    return NextResponse.json({ ...fundingQuote(arc, payer, { chainId, nativeBalance, allowance, gasPrice,
      approvalEstimate: approvalNeeded ? estimate : undefined, depositEstimate: approvalNeeded ? undefined : estimate }, Date.now(), amount),
      reason: "Only the unfunded remainder of the frozen 0.232600 USDC campaign", gateway_available_usdc: raw }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Funding quote unavailable";
    return NextResponse.json({ error: /^(Reconcile the first|No top-up needed)/.test(message) ? message : "Funding simulation, allowance or gas check unavailable. No transaction attempted." }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}

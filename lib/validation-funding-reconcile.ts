import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { getArcConfig, getPilotBuyerAddress } from "./arc";
import { assertCanonicalFundingFacts, fundingResult, type FundingFacts } from "./funding-reconciliation";

export async function validationFundingReconcile(request: NextRequest) {
  const headers = { "cache-control": "no-store" };
  try {
    const p = request.nextUrl.searchParams;
    if ([...p.keys()].some(k => !["hash", "kind", "amount_atomic", "revoke_hash"].includes(k))) throw new Error();
    const hash = p.get("hash") ?? "", kind = p.get("kind"), amount = p.get("amount_atomic") ?? "", revoke = p.get("revoke_hash");
    if (!/^0x[\da-f]{64}$/i.test(hash) || !["approve", "deposit"].includes(kind ?? "") || !/^[1-9]\d{0,5}$/.test(amount) || BigInt(amount) > 223_600n || revoke && !/^0x[\da-f]{64}$/i.test(revoke)) throw new Error();
    const arc = getArcConfig(), payer = getPilotBuyerAddress();
    if (arc.mode !== "mainnet") throw new Error();
    const client = createPublicClient({ transport: http(arc.rpcUrl, { timeout: 7000, retryCount: 0 }) });
    const [chain, head] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    if (chain !== 5042) throw new Error();
    async function facts(value: string): Promise<FundingFacts> {
      const hash = value as `0x${string}`;
      const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || tx.hash.toLowerCase() !== hash.toLowerCase()) throw new Error();
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      assertCanonicalFundingFacts({ hash, tx, receipt }, head, block.hash);
      return { hash, tx, receipt };
    }
    const [original, revoked, allowance] = await Promise.all([facts(hash), revoke ? facts(revoke) : undefined,
      client.readContract({ address: arc.usdc, abi: erc20Abi, functionName: "allowance", args: [payer, arc.gatewayWallet] })]);
    return NextResponse.json(fundingResult(arc, payer, kind as "approve" | "deposit", BigInt(amount), original, allowance, revoked), { headers });
  } catch {
    return NextResponse.json({ error: "暂未核实原交易。请确认哈希正确、已获得三次确认，稍后仅重试只读核对；原记录保留，不要重复发送。", transaction_attempted: false }, { status: 409, headers });
  }
}

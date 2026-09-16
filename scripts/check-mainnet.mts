/** Read-only diagnostics. No dotenv, wallet, signing, deposits or transfers. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { Blockchain } from "@circle-fin/app-kit";
import { ARC_NETWORKS } from "../lib/network";

const network = ARC_NETWORKS.mainnet;
const checks: { name: string; ok: boolean; detail: unknown }[] = [];
async function check(name: string, fn: () => Promise<unknown>) {
  try { checks.push({ name, ok: true, detail: await fn() }); }
  catch (error) { checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) }); }
}
async function json(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function rpc(method: string, params: unknown[]) {
  // This allowlist is intentionally incapable of signing or broadcasting.
  if (!["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(method)) throw new Error("Read-only RPC method required");
  const result = await json(network.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (result.error || !result.result) throw new Error(`RPC ${method} returned no result`);
  return result.result;
}
await check("installed_sdk_chain_definitions", async () => {
  const config = CHAIN_CONFIGS.arc;
  if (!config || config.chain.id !== network.chainId || config.gatewayWallet.toLowerCase() !== network.gatewayWallet.toLowerCase() || Blockchain.Arc !== "Arc") throw new Error("Installed SDKs do not match Arc mainnet");
  const versions: Record<string, string> = {};
  for (const name of ["@circle-fin/x402-batching", "@circle-fin/app-kit", "@circle-fin/adapter-circle-wallets", "viem"]) {
    versions[name] = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8")).version;
  }
  return { versions, chainId: config.chain.id, scope: "definitions_only_not_wallet_or_send_validation" };
});
await check("rpc_identity_and_recent_block", async () => {
  const id = await rpc("eth_chainId", []);
  if (Number(BigInt(id)) !== network.chainId) throw new Error("Unexpected RPC chain ID");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  const ageSeconds = Math.floor(Date.now() / 1000) - Number(BigInt(block.timestamp));
  if (ageSeconds < -30 || ageSeconds > 180) throw new Error(`Latest block age ${ageSeconds}s outside allowed range`);
  return { chainId: network.chainId, blockNumber: BigInt(block.number).toString(), blockHash: block.hash, ageSeconds };
});
await Promise.all([
  check("usdc_and_gateway_contracts", async () => {
    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    const details = [];
    for (const [name, address] of [["USDC", network.usdc], ["GatewayWallet", network.gatewayWallet]]) {
      const code: string = await rpc("eth_getCode", [address, block.number]);
      if (code === "0x" || code === "0x0") throw new Error(`${name} has no code`);
      details.push({ name, address, byteLength: (code.length - 2) / 2, codeSha256: createHash("sha256").update(code).digest("hex") });
    }
    const decimals = Number(BigInt(await rpc("eth_call", [{ to: network.usdc, data: "0x313ce567" }, block.number])));
    if (decimals !== 6) throw new Error(`Unexpected ERC-20 USDC decimals: ${decimals}`);
    return { blockNumber: BigInt(block.number).toString(), tokenDecimals: decimals, nativeGasDecimals: 18, contracts: details, scope: "presence_and_decimals_not_security_audit" };
  }),
  check("gateway_advertises_arc_mainnet", async () => {
    const result = await json(`${network.facilitatorUrl}/v1/x402/supported`);
    const kind = result.kinds?.find((k: any) => k.network === network.caip2 && k.scheme === "exact" && k.x402Version === 2);
    if (!kind || kind.extra?.name !== "GatewayWalletBatched" || kind.extra?.verifyingContract?.toLowerCase() !== network.gatewayWallet.toLowerCase() || !kind.extra?.assets?.some((a: any) => a.address?.toLowerCase() === network.usdc.toLowerCase() && a.decimals === 6)) throw new Error("Gateway did not advertise the expected Arc mainnet payment kind");
    return kind;
  }),
]);
const report = {
  schemaVersion: 1, capturedAt: new Date().toISOString(), kind: "read_only_compatibility",
  network: network.caip2, signedRequests: 0, payments: 0, transactionsBroadcast: 0,
  dependencyChecksPassed: checks.every(c => c.ok), mainnetExecutionEnabled: false,
  productionReady: false, checks,
  remainingGates: ["durable seller recovery and buyer spend reservation", "explicit owner-approved wallet identities and test budget", "paid external-client delivery and batch-settlement reconciliation", "deployed OpenAPI and service review", "grant eligibility confirmation"],
};
const directory = resolve(import.meta.dirname, "../docs/evidence");
await mkdir(directory, { recursive: true });
const path = resolve(directory, `mainnet-compatibility-${report.capturedAt.replace(/[:.]/g, "-")}.json`);
await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path, ...report }, null, 2));
if (!report.dependencyChecksPassed) process.exitCode = 1;

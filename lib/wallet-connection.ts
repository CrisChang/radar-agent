import type { EIP1193Provider } from "viem";

export type WalletChoice = "auto" | "okx" | "ethereum";
type InjectedWindow = { okxwallet?: unknown; ethereum?: unknown };
function provider(value: unknown): EIP1193Provider | undefined {
  if (!value || typeof value !== "object") return;
  if (typeof (value as { request?: unknown }).request === "function") return value as EIP1193Provider;
  const nested = (value as { ethereum?: unknown }).ethereum;
  if (nested && typeof (nested as { request?: unknown }).request === "function") return nested as EIP1193Provider;
}
export function injectedWallet(target: unknown, choice: WalletChoice = "auto"): EIP1193Provider {
  const globals = target && typeof target === "object" ? target as InjectedWindow : {};
  const okx = provider(globals.okxwallet), ethereum = provider(globals.ethereum);
  const selected = choice === "okx" ? okx : choice === "ethereum" ? ethereum : okx ?? ethereum;
  if (!selected) throw new Error("未检测到所选钱包。请在 Chrome 的扩展菜单允许 OKX／MetaMask 访问本站，解锁钱包后刷新；Codex 内置浏览器请改用装有钱包的 Chrome。");
  return selected;
}
function errorCode(error: unknown): number | undefined {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (typeof e.code === "number") return e.code;
    current = e.cause;
  }
}
export function connectionError(error: unknown): string {
  switch (errorCode(error)) {
    case -32002: return "钱包中已有待处理的连接请求。请点击 Chrome 右上角的钱包图标，先完成或取消旧请求，再连接；不要连续点击。";
    case 4001: return "你取消了钱包连接，尚未发起付款。需要连接时可重新点击。";
    case 4100: return "钱包未授权本站读取账户。请解锁钱包并允许本站连接，再重试。";
    case 4200: case -32601: return "钱包不支持此连接权限操作。请在扩展里手动选择账户或断开本站，然后重新连接。";
    case 4900: case 4901: return "钱包暂未连接网络。请解锁扩展、检查网络后重新连接。";
  }
  return error instanceof Error ? error.message.slice(0, 300) : "钱包连接未完成。请打开 Chrome 右上角的钱包扩展查看待处理请求。";
}
// Only account/connection methods may time out here. Never race payment,
// transaction or message-signing requests, and never automatically retry.
type ConnectionMethod = "eth_requestAccounts" | "eth_accounts" | "eth_chainId" | "wallet_requestPermissions" | "wallet_revokePermissions";
const METHODS = new Set<ConnectionMethod>(["eth_requestAccounts", "eth_accounts", "eth_chainId", "wallet_requestPermissions", "wallet_revokePermissions"]);
export async function connectionRequest(wallet: EIP1193Provider, method: ConnectionMethod, params?: readonly unknown[], timeoutMs = 45_000): Promise<unknown> {
  if (!METHODS.has(method)) throw new Error("Only connection methods may use the connection timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      wallet.request({ method, ...(params ? { params } : {}) } as Parameters<EIP1193Provider["request"]>[0]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("钱包尚未回应。请打开 Chrome 右上角的钱包扩展，先完成或取消待处理连接；本页不会自动重复请求，也未发起付款。")), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
export function connectedAddress(accounts: unknown): `0x${string}` | undefined {
  return Array.isArray(accounts) && typeof accounts[0] === "string" && /^0x[\da-f]{40}$/i.test(accounts[0]) ? accounts[0] as `0x${string}` : undefined;
}

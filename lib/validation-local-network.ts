import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { request as httpsRequest, type Agent } from "node:https";
import createHttpsProxyAgent from "https-proxy-agent";
import { RUNNER_ORIGIN } from "./validation-handoff";
import { accelerationMessage } from "./validation-timing";
export class RunnerNetworkError extends Error {
  constructor(message: string, readonly retryable = false) { super(message); }
}
export interface NetworkChoice { proxy?: string; source: "manual" | "environment" | "macOS" | "direct" }
export function checkedProxy(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new RunnerNetworkError("代理地址不符合要求：请使用代理软件的 HTTP／混合端口，例如 --proxy http://127.0.0.1:端口；不支持 SOCKS、PAC 或带密码的地址。"); }
}
export function macProxy(text: string): string | undefined {
  function value(key: string) { return new RegExp(`^\\s*${key}\\s*:\\s*([^\\r\\n]+)`, "m").exec(text)?.[1].trim(); }
  for (const kind of ["HTTPS", "HTTP"]) {
    if (value(`${kind}Enable`) !== "1") continue;
    const host = value(`${kind}Proxy`), port = value(`${kind}Port`);
    if (!host || !port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new RunnerNetworkError("macOS 系统代理配置不完整，请检查代理软件的 HTTP／混合端口。");
    return checkedProxy(`http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`);
  }
}
export async function selectNetwork(explicit?: string, options: {
  env?: Record<string, string | undefined>; platform?: string; readMacProxy?: () => Promise<string>;
} = {}): Promise<NetworkChoice> {
  const env = options.env ?? process.env;
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new RunnerNetworkError("终端关闭了 HTTPS 证书校验。请移除 NODE_TLS_REJECT_UNAUTHORIZED=0 后再检查；脚本不会在关闭校验时运行。");
  if (explicit === "direct") return { source: "direct" };
  if (explicit) return { proxy: checkedProxy(explicit), source: "manual" };
  const bypass = (env.NO_PROXY ?? env.no_proxy ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const host = new URL(RUNNER_ORIGIN).hostname;
  if (bypass.some(s => s === "*" || host === s.replace(/^\./, "") || (s.startsWith(".") && host.endsWith(s)))) return { source: "direct" };
  const configured = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  if (configured) return { proxy: checkedProxy(configured), source: "environment" };
  if ((options.platform ?? process.platform) === "darwin") {
    const read = options.readMacProxy ?? (async () => (await promisify(execFile)("/usr/sbin/scutil", ["--proxy"], { timeout: 3000, maxBuffer: 65536 })).stdout);
    let raw: string;
    try { raw = await read(); } catch { raw = ""; }
    const proxy = macProxy(raw); if (proxy) return { proxy, source: "macOS" };
  }
  return { source: "direct" };
}
function networkCode(error: unknown): string {
  let current = error;
  const codes: string[] = [];
  for (let n = 0; n < 6 && current && typeof current === "object"; n++) {
    const e = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof e.code === "string") codes.push(e.code);
    if (typeof e.name === "string") codes.push(e.name);
    current = e.cause;
  }
  return codes.find(c => ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "TimeoutError", "AbortError", "ABORT_ERR"].includes(c)) ?? "NETWORK_ERROR";
}
function transientNetworkError(error: unknown) {
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "TimeoutError", "AbortError", "ABORT_ERR"].includes(networkCode(error));
}
export function safeNetworkError(error: unknown, choice?: NetworkChoice): string {
  const known = networkCode(error);
  if (/CERT|TLS|VERIFY/.test(known)) return `网络检查失败（${known}）：HTTPS 证书校验失败；请检查系统时间和代理证书设置，不要关闭证书校验。`;
  if (choice?.proxy) return `网络连接失败（${known}）：已使用指定 HTTP 代理，但本次连接失败或中断。请保持代理开启并检查当前节点；无需重新生成接管包。`;
  return `网络连接失败（${known}）：浏览器代理可能没有应用到终端。请开启 macOS 系统代理，或在命令末尾添加 --proxy http://127.0.0.1:实际HTTP端口。无需重新生成接管包。`;
}
function isTimingControl(url: URL, input: RequestInfo | URL, init?: RequestInit) {
  if (url.pathname !== "/api/validation/control" || url.search || input instanceof Request || init?.method !== "POST" ||
      typeof init.body !== "string" || init.body.length > 4096 || new Headers(init.headers).has("payment-signature")) return false;
  try {
    const b = JSON.parse(init.body);
    if (Object.keys(b).sort().join() !== "action,bundleHash,reservedCount,runnerId,signature,timestamp" ||
        b.action !== "accelerate" || !/^0x[\da-f]{130}$/i.test(b.signature)) return false;
    accelerationMessage(url.origin, b.runnerId, b.bundleHash, b.reservedCount, b.timestamp); return true;
  } catch { return false; }
}
/** Pinned GET endpoints plus one narrowly scoped timing-control POST; TLS validation, no redirects or transport retries. */
export function createRunnerNetwork(choice: NetworkChoice, direct: typeof fetch = globalThis.fetch) {
  const proxy = choice.proxy ? new URL(checkedProxy(choice.proxy)) : undefined;
  let lastError: string | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const timingControl = isTimingControl(url, input, init);
    if (url.origin !== RUNNER_ORIGIN || url.username || url.password || url.hash ||
        (!timingControl && (!["/api/validation/status", "/api/validation/payment"].includes(url.pathname) ||
        (init?.method && init.method !== "GET") || init?.body || (input instanceof Request && input.method !== "GET")))) throw new RunnerNetworkError("网络请求超出固定测试接口，已拒绝。");
    const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const requestLabel = timingControl ? "时间计划变更" : url.pathname.endsWith("/status") ? "只读状态查询" : requestHeaders.has("payment-signature") ? "付款提交／原授权重放" : "未签名付款报价";
    try {
      const response = !proxy ? await direct(input, { ...init, redirect: "error" }) : await new Promise<Response>((resolve, reject) => {
        const headers = new Headers(requestHeaders); headers.set("accept-encoding", "identity");
        const signal = init?.signal ?? AbortSignal.timeout(30_000);
        // Bind the same cancellation signal to the CONNECT socket, including
        // while the proxy has not replied. Each request owns its own agent.
        const agent = createHttpsProxyAgent({ host: proxy.hostname.replace(/^\[|\]$/g, ""), port: Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80)), protocol: proxy.protocol, signal });
        const req = httpsRequest(url, { method: timingControl ? "POST" : "GET", // agent-base v6 predates the modern Agent type; its addRequest API is supported.
          headers: Object.fromEntries(headers), agent: agent as unknown as Agent,
          signal }, res => {
          const status = res.statusCode ?? 502, bytes: Buffer[] = []; let size = 0;
          res.on("error", reject);
          res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 8_388_608) { req.destroy(new RunnerNetworkError("网络响应超出大小上限，已停止。")); return; } bytes.push(chunk); });
          res.on("end", () => {
            if (!res.complete) { reject(new RunnerNetworkError("网络响应不完整，已停止；请保留原记录。")); return; }
            const out = new Headers(); for (let i = 0; i < res.rawHeaders.length; i += 2) out.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
            try { resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(bytes), { status, headers: out })); }
            catch { reject(new RunnerNetworkError("网络响应格式异常，已停止；请检查代理设置。")); }
          });
        });
        req.on("error", reject); req.end(timingControl ? init!.body as string : undefined);
      });
      if (response.status >= 300 && response.status < 400) throw new RunnerNetworkError("测试接口发生跳转，已停止；请检查代理或网络登录页。");
      if (response.status === 407) throw new RunnerNetworkError("本机代理要求认证。请使用无需密码的本机 HTTP／混合端口。");
      lastError = undefined; return response;
    } catch (e) {
      const error = e instanceof RunnerNetworkError ? e : new RunnerNetworkError(`${requestLabel}：${safeNetworkError(e, choice)}`, transientNetworkError(e));
      lastError = error.message; throw error;
    }
  };
  return { fetcher, lastError: () => lastError, description: proxy ? `${choice.source} HTTP 代理 ${proxy}` : "直连（未检测到 HTTP 系统／环境代理）" };
}

/** Only this fixed, unsigned status endpoint may retry. Never wrap payment requests. */
export async function readRunnerStatus(network: Pick<ReturnType<typeof createRunnerNetwork>, "fetcher">, onRetry: (message: string) => void = () => {},
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await network.fetcher(`${RUNNER_ORIGIN}/api/validation/status`, { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new RunnerNetworkError(`只读进度接口返回 HTTP ${response.status}。`, [502, 503, 504].includes(response.status));
      try { return await response.json() as Record<string, unknown>; }
      catch (error) {
        if (transientNetworkError(error)) throw new RunnerNetworkError(`只读状态响应中断（${networkCode(error)}）。`, true);
        throw new RunnerNetworkError("只读进度接口没有返回有效 JSON，请检查代理或网络登录页；不要重新生成接管包。");
      }
    } catch (error) {
      if (!(error instanceof RunnerNetworkError) || !error.retryable || attempt === 3) throw error;
      onRetry(`只读状态查询暂时失败，将在 ${attempt * 2} 秒后重试（${attempt + 1}/3）；不会提交付款。`);
      await wait(attempt * 2_000);
    }
  }
  throw new RunnerNetworkError("只读状态查询未完成。");
}

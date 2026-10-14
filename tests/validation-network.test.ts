import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer as httpsServer } from "node:https";
import { createServer as httpServer } from "node:http";
import { connect, type Socket } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { macProxy, selectNetwork, safeNetworkError, createRunnerNetwork, checkedProxy } from "../lib/validation-local-network";
import { RUNNER_ORIGIN } from "../lib/validation-handoff";
const exec = promisify(execFile);
test("proxy selection reads macOS and environment, supports explicit override, refuses unsafe configuration", async () => {
  const fixture = `<dictionary> {\n  HTTPEnable : 1\n  HTTPProxy : 127.0.0.1\n  HTTPPort : 7897\n  HTTPSEnable : 1\n  HTTPSProxy : 127.0.0.1\n  HTTPSPort : 7890\n}`;
  assert.equal(macProxy(fixture), "http://127.0.0.1:7890");
  assert.equal(macProxy(fixture.replace("HTTPSEnable : 1", "HTTPSEnable : 0")), "http://127.0.0.1:7897");
  assert.equal(macProxy("<dictionary> {}"), undefined);
  const options = { env: {}, platform: "darwin", readMacProxy: async () => fixture };
  assert.deepEqual(await selectNetwork(undefined, options), { source: "macOS", proxy: "http://127.0.0.1:7890" });
  assert.deepEqual(await selectNetwork(undefined, { ...options, env: { HTTPS_PROXY: "http://127.0.0.1:8888" } }), { source: "environment", proxy: "http://127.0.0.1:8888" });
  assert.deepEqual(await selectNetwork("direct", options), { source: "direct" });
  assert.deepEqual(await selectNetwork("http://127.0.0.1:9999", options), { source: "manual", proxy: "http://127.0.0.1:9999" });
  assert.deepEqual(await selectNetwork(undefined, { ...options, env: { HTTPS_PROXY: "http://127.0.0.1:8888", NO_PROXY: ".vercel.app" } }), { source: "direct" });
  for (const p of ["socks5://127.0.0.1:7891", "http://user:secret@127.0.0.1", "http://localhost/a?key=secret", "file:///tmp/proxy"]) assert.throws(() => checkedProxy(p));
  await assert.rejects(selectNetwork("direct", { env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } }), /证书校验/);
});
test("network diagnostics redact upstream data, prohibit redirects and other origins, and never retry", async () => {
  let calls = 0;
  const error = { message: "private-header-must-not-print", cause: { code: "ECONNREFUSED", message: "secret" } };
  const n = createRunnerNetwork({ source: "direct" }, async () => { calls++; throw error; });
  await assert.rejects(n.fetcher(`${RUNNER_ORIGIN}/api/validation/status`), /ECONNREFUSED/); assert.equal(calls, 1);
  assert.ok(!safeNetworkError(error).includes("secret")); assert.ok(!safeNetworkError(error).includes("private-header"));
  assert.match(safeNetworkError({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" }), /不要关闭/);
  await assert.rejects(n.fetcher("https://evil.example/api/validation/status"));
  await assert.rejects(n.fetcher(`${RUNNER_ORIGIN}/api/validation/control`));
  await assert.rejects(n.fetcher(`${RUNNER_ORIGIN}/api/validation/status`, { method: "POST" })); assert.equal(calls, 1);
  const redirect = createRunnerNetwork({ source: "direct" }, async (_url, init) => { calls++; assert.equal(init?.redirect, "error"); return new Response(null, { status: 302, headers: { location: "https://evil.example" } }); });
  await assert.rejects(redirect.fetcher(`${RUNNER_ORIGIN}/api/validation/status`), /跳转/); assert.equal(calls, 2);
});
test("downloaded CLI connects through a real local CONNECT tunnel and retains TLS verification", async () => {
  const root = await mkdtemp("/private/tmp/radar-proxy-fixture-"), sockets = new Set<Socket>();
  let tls: ReturnType<typeof httpsServer> | undefined, proxy: ReturnType<typeof httpServer> | undefined;
  try {
    // Disposable TLS fixture only: never a wallet key, never used outside loopback.
    await exec("/usr/bin/openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${root}/tls-key.pem`, "-out", `${root}/tls-cert.pem`, "-days", "1", "-subj", "/CN=radar-agent-ivory.vercel.app"]);
    let requests = 0, tunnels = 0, redirect = false, stall = false, stallDisconnected = false;
    tls = httpsServer({ key: await readFile(`${root}/tls-key.pem`), cert: await readFile(`${root}/tls-cert.pem`) }, (req, res) => {
      requests++; assert.equal(req.url, "/api/validation/status"); assert.equal(req.headers["payment-signature"], undefined);
      if (redirect) { res.writeHead(302, { location: "https://evil.example" }); res.end(); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ storage_status: "available" }));
    });
    tls.listen(0, "127.0.0.1"); await once(tls, "listening"); const tlsPort = (tls.address() as { port: number }).port;
    proxy = httpServer();
    proxy.on("connect", (req, socket, head) => {
      tunnels++; assert.equal(req.url, "radar-agent-ivory.vercel.app:443");
      if (stall) { sockets.add(socket as Socket); socket.on("end", () => { stallDisconnected = true; socket.destroy(); }); socket.on("close", () => sockets.delete(socket as Socket)); socket.resume(); return; }
      const upstream = connect(tlsPort, "127.0.0.1", () => { socket.write("HTTP/1.1 200 Connection Established\r\n\r\n"); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket); });
      sockets.add(socket as Socket); sockets.add(upstream);
      socket.on("error", () => upstream.destroy()); upstream.on("error", () => socket.destroy());
      socket.on("close", () => { sockets.delete(socket as Socket); upstream.destroy(); }); upstream.on("close", () => sockets.delete(upstream));
    });
    proxy.listen(0, "127.0.0.1"); await once(proxy, "listening"); const proxyPort = (proxy.address() as { port: number }).port;
    const args = [fileURLToPath(new URL("../public/downloads/radar-validation-runner-v2.cjs", import.meta.url)), "--network-check", "--proxy", `http://127.0.0.1:${proxyPort}`];
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", NODE_OPTIONS: "", NODE_TLS_REJECT_UNAUTHORIZED: "1" }; delete env.NODE_EXTRA_CA_CERTS;
    const passed = await exec(process.execPath, args, { env: { ...env, NODE_EXTRA_CA_CERTS: `${root}/tls-cert.pem` }, timeout: 15000 });
    assert.match(passed.stdout, /联网检查通过/); assert.equal(requests, 1); assert.equal(tunnels, 1);
    await assert.rejects(exec(process.execPath, args, { env, timeout: 15000 }), (e: unknown) => {
      const error = e as { stderr: string }; assert.match(error.stderr, /证书校验失败/); return true;
    });
    assert.equal(requests, 1); assert.equal(tunnels, 2); // untrusted TLS never reaches HTTP
    redirect = true;
    await assert.rejects(exec(process.execPath, args, { env: { ...env, NODE_EXTRA_CA_CERTS: `${root}/tls-cert.pem` }, timeout: 15000 }), (e: unknown) => {
      assert.match((e as { stderr: string }).stderr, /跳转/); return true;
    });
    assert.equal(requests, 2); assert.equal(tunnels, 3); // no redirected request or retry
    stall = true;
    const stalled = createRunnerNetwork({ source: "manual", proxy: `http://127.0.0.1:${proxyPort}` });
    await assert.rejects(stalled.fetcher(`${RUNNER_ORIGIN}/api/validation/status`, { signal: AbortSignal.timeout(50) }), /ABORT|Timeout/);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(tunnels, 4); assert.equal(stallDisconnected, true, "cancel disconnects even an unfinished CONNECT socket");
  } finally {
    for (const socket of sockets) socket.destroy();
    if (proxy) await new Promise<void>(r => proxy!.close(() => r()));
    if (tls) await new Promise<void>(r => tls!.close(() => r()));
    await rm(root, { recursive: true, force: true });
  }
});

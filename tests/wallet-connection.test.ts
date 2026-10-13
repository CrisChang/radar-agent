import assert from "node:assert/strict";
import test from "node:test";
import type { EIP1193Provider } from "viem";
import { connectedAddress, connectionError, connectionRequest, injectedWallet } from "../lib/wallet-connection";

const wallet = (request: (args: { method: string }) => Promise<unknown>) => ({ request }) as EIP1193Provider;
test("connection selects the requested extension and never silently falls back to another wallet", () => {
  const okx = wallet(async () => []), ethereum = wallet(async () => []);
  assert.equal(injectedWallet({ okxwallet: okx, ethereum }), okx);
  assert.equal(injectedWallet({ okxwallet: okx, ethereum }, "ethereum"), ethereum);
  assert.equal(injectedWallet({ okxwallet: { ethereum: okx } }, "okx"), okx);
  assert.equal(injectedWallet({ okxwallet: {}, ethereum }), ethereum);
  assert.throws(() => injectedWallet({ ethereum }, "okx"), /扩展菜单/);
  assert.throws(() => injectedWallet({}), /Chrome/);
});
test("pending, rejected and disconnected connections have actionable messages", () => {
  assert.match(connectionError({ cause: { code: -32002 } }), /待处理/);
  assert.match(connectionError({ code: 4001 }), /取消了钱包连接/);
  assert.match(connectionError({ code: 4900 }), /暂未连接网络/);
  assert.match(connectionError({ code: 4200 }), /手动选择账户/);
});
test("connection timeout makes one request, never retries and ignores a late reply", async () => {
  let calls = 0, resolve!: (value: unknown) => void;
  const p = wallet(() => { calls++; return new Promise(r => { resolve = r; }); });
  await assert.rejects(connectionRequest(p, "eth_requestAccounts", undefined, 5), /不会自动重复请求/);
  resolve(["0x1111111111111111111111111111111111111111"]);
  await Promise.resolve(); assert.equal(calls, 1);
});
test("connection helper passes successful responses and original rejection through without retry", async () => {
  let calls = 0; const accounts = ["0x1111111111111111111111111111111111111111"];
  const p = wallet(async () => { calls++; return accounts; });
  assert.equal(await connectionRequest(p, "eth_accounts", undefined, 5), accounts); assert.equal(calls, 1);
  const rejection = { code: 4001 };
  await assert.rejects(connectionRequest(wallet(async () => { throw rejection; }), "eth_requestAccounts", undefined, 5), e => e === rejection);
});
test("connection helper cannot issue a payment, signature or transaction", async () => {
  let calls = 0; const p = wallet(async () => { calls++; return null; });
  for (const method of ["eth_sendTransaction", "eth_signTypedData_v4", "personal_sign"]) {
    await assert.rejects(connectionRequest(p, method as "eth_accounts", undefined, 5), /Only connection methods/);
  }
  assert.equal(calls, 0);
});
test("only a valid returned account can become a connected wallet", () => {
  assert.equal(connectedAddress(["0x1111111111111111111111111111111111111111"]), "0x1111111111111111111111111111111111111111");
  for (const value of [undefined, {}, [], ["not-an-address"], "0x1111111111111111111111111111111111111111"]) assert.equal(connectedAddress(value), undefined);
});

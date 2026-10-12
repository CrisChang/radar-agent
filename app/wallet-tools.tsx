"use client";
import { useEffect, useState } from "react";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { createPublicClient, createWalletClient, custom, defineChain, erc20Abi, type EIP1193Provider } from "viem";
import type { ArcConfig } from "@/lib/arc";
import type { Bill } from "@/lib/billing";
import { assertFundingQuote, gatewayDepositAbi, PILOT_DEPOSIT_ATOMIC, type FundingQuote } from "@/lib/gateway-funding";
import { discoverSignal, paySignal, signalEndpoint } from "@/lib/agent-http";
import { billingMessage } from "@/lib/billing-auth";

function provider(): EIP1193Provider {
  const ethereum = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("Open this page in a browser with your EVM wallet installed.");
  return ethereum;
}
function walletClient(arc: ArcConfig, address: `0x${string}`) {
  const chain = defineChain({ id: arc.chainId, name: arc.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [arc.rpcUrl] } } });
  return createWalletClient({ account: address, chain, transport: custom(provider()) });
}
const safeError = (error: unknown) => error instanceof Error && /wallet|chain|budget|Gateway|quote|offer|paused|signature|Receipt|authorization|endpoint|store|balance|request|connect/i.test(error.message)
  ? error.message.slice(0,240) : "The operation did not complete. Check your wallet and reconcile before another payment.";

export default function WalletTools({ arc, seller, price, mode, paymentsEnabled }: {
  arc: ArcConfig; seller: string; price: string; mode: "pilot" | "billing"; paymentsEnabled: boolean;
}) {
  const [wallet, setWallet] = useState<`0x${string}`>();
  const [busy, setBusy] = useState(false);
  const [connectedChainId, setConnectedChainId] = useState<number>();
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [result, setResult] = useState<unknown>();
  const [balance, setBalance] = useState<string>();
  const [funding, setFunding] = useState<FundingQuote>();
  const [consent, setConsent] = useState(false);
  const [fundingHash, setFundingHash] = useState<string>();
  const correctWallet = !!wallet && wallet.toLowerCase() === seller.toLowerCase();
  const correctChain = connectedChainId === arc.chainId;
  function accountSelected(value: unknown) {
    const address = Array.isArray(value) && typeof value[0] === "string" && /^0x[\da-fA-F]{40}$/.test(value[0]) ? value[0] as `0x${string}` : undefined;
    setWallet(address); setBalance(undefined); setFunding(undefined); setConsent(false); setBills([]); setResult(undefined); setFundingHash(undefined);
    return address;
  }
  useEffect(() => {
    let ethereum: EIP1193Provider;
    try { ethereum = provider(); } catch { return; }
    const accountsChanged = (value: unknown) => {
      const address = accountSelected(value);
      setMessage(address ? "Wallet account changed. Check the address and approve the displayed budget again." : "Wallet disconnected. Connect the approved pilot wallet.");
    };
    const chainChanged = (value: unknown) => {
      setConnectedChainId(typeof value === "string" ? Number(value) : undefined);
      setFunding(undefined); setConsent(false); setMessage("Wallet network changed. Check the network before continuing.");
    };
    ethereum.on?.("accountsChanged", accountsChanged); ethereum.on?.("chainChanged", chainChanged);
    return () => { ethereum.removeListener?.("accountsChanged", accountsChanged); ethereum.removeListener?.("chainChanged", chainChanged); };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage("处理中，请查看钱包弹窗 / Processing — check your wallet popup.");
    try { await action(); } catch (error) { setMessage(safeError(error)); } finally { setBusy(false); }
  }
  async function connect() {
    const accounts = await provider().request({ method: "eth_requestAccounts" });
    const address = accounts[0];
    if (!address || !/^0x[\da-fA-F]{40}$/.test(address)) throw new Error("No wallet account was connected.");
    accountSelected(accounts);
    setConnectedChainId(Number(await provider().request({ method: "eth_chainId" })));
    setMessage(mode === "pilot" && address.toLowerCase() !== seller.toLowerCase()
      ? "钱包地址不匹配。请在钱包扩展中选择页面指定的测试地址，然后重新连接。No payment was attempted."
      : "钱包已连接。请核对网络并勾选预算后继续；尚未授权付款。Wallet connected; no payment authorized.");
  }
  async function chooseAccount() {
    try {
      await provider().request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code !== 4200 && code !== -32601) throw error;
      throw new Error("Wallet account selection is unavailable. Select the approved account in your wallet extension, then connect again.");
    }
    await connect();
  }
  async function disconnect() {
    accountSelected([]); setConnectedChainId(undefined);
    try {
      await provider().request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      accountSelected([]); setConnectedChainId(undefined);
      setMessage("已断开并撤销此网站的钱包连接权限。点击选择账户重新授权；历史付款预算仍保留。Disconnected. Choose an account to authorize again; payment reservations are preserved.");
    } catch {
      accountSelected([]); setConnectedChainId(undefined);
      setMessage("页面已断开。钱包未确认撤销授权，请点击选择账户重新授权，或在钱包的已连接网站中断开本站。Page disconnected; wallet permission revocation was not confirmed. Payment reservations are preserved.");
    }
  }
  async function switchNetwork() {
    try {
      await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${arc.chainId.toString(16)}` }] });
      setConnectedChainId(Number(await provider().request({ method: "eth_chainId" })));
      setFunding(undefined); setConsent(false);
      setMessage("网络已切换，请重新核对预算。Network selected; review the budget again.");
    } catch {
      throw new Error(`Wallet network switch did not complete. Add/select ${arc.name} manually: chain ${arc.chainId}, RPC ${arc.rpcUrl}, native gas USDC.`);
    }
  }
  async function assertAccount() {
    if (!wallet) throw new Error("Connect your wallet first.");
    const accounts = await provider().request({ method: "eth_accounts" });
    if (accounts[0]?.toLowerCase() !== wallet.toLowerCase()) throw new Error("Wallet account changed. Connect the intended account again.");
    return wallet;
  }
  async function checkBalance() {
    const address = await assertAccount();
    const response = await fetch(`/api/gateway-balance?wallet=${address}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error("Unable to verify Gateway balance. No payment attempted.");
    setBalance(body.gateway_available_usdc);
  }
  async function assertPilot() {
    const address = await assertAccount();
    if (address.toLowerCase() !== seller.toLowerCase()) throw new Error("Connect the owner-confirmed pilot wallet shown on this page.");
    if (Number(await provider().request({ method: "eth_chainId" })) !== arc.chainId) throw new Error(`Switch your wallet to ${arc.name}, chain ${arc.chainId}.`);
    return address;
  }
  const fundingKey = (address: string, kind: string) => `radar:funding:v1:${arc.chainId}:${address.toLowerCase()}:${kind}`;
  async function reviewFunding() {
    const address = await assertPilot();
    const balances = await fetch(`/api/gateway-balance?wallet=${address}`, { cache: "no-store" });
    const b = await balances.json();
    if (!balances.ok) throw new Error("Gateway balance cannot be verified. No funding attempted.");
    setBalance(b.gateway_available_usdc);
    if (Number(b.gateway_available_usdc) >= Number(price)) {
      setFunding(undefined); setMessage("Gateway already covers one query. No deposit is needed."); return;
    }
    const response = await fetch(`/api/gateway-funding?wallet=${address}`, { cache: "no-store" });
    const q = await response.json();
    if (!response.ok) throw new Error(q.error ?? "Gateway quote is unavailable.");
    assertFundingQuote(q, arc, address); setFunding(q);
    setMessage("Read-only quote ready. Review the amount and gas ceiling before a wallet transaction.");
  }
  async function reconcileFunding(kind: "approve" | "deposit") {
    const address = await assertPilot();
    const key = fundingKey(address, kind);
    const raw = localStorage.getItem(key);
    if (!raw) { setMessage("No saved funding transaction for this step."); return; }
    const saved = JSON.parse(raw) as { hash?: `0x${string}`; status: string };
    if (!saved.hash) throw new Error("Gateway transaction outcome is unknown. Inspect your wallet history before any retry.");
    setFundingHash(saved.hash);
    const publicClient = createPublicClient({ transport: custom(provider()) });
    const receipt = await publicClient.getTransactionReceipt({ hash: saved.hash });
    if (receipt.status !== "success") throw new Error("Gateway transaction reverted. Inspect its receipt before another attempt.");
    if (kind === "approve") localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ ...saved, status: "confirmed" }));
    setFunding(undefined);
    setMessage(kind === "approve" ? "Exact approval confirmed. Review a fresh quote to simulate the deposit." : "Deposit confirmed on Arc. Check Gateway balance before buying the signal.");
  }
  async function fund(kind: "approve" | "deposit") {
    const address = await assertPilot();
    if (!consent || !funding) throw new Error("Review the Gateway quote and approve the bounded pilot budget first.");
    assertFundingQuote(funding, arc, address);
    if ((kind === "approve") !== funding.approval_needed || (kind === "deposit" && !funding.deposit_simulated)) throw new Error("Gateway funding step changed. Review a fresh quote.");
    if (!navigator.locks) throw new Error("This browser cannot lock the Gateway funding budget. Use current Chrome.");
    const key = fundingKey(address, kind);
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock || localStorage.getItem(key)) throw new Error("Gateway funding is reserved or complete. Reconcile its transaction before any retry.");
      localStorage.setItem(key, JSON.stringify({ status: "pending", created_at: new Date().toISOString() }));
      let hash: `0x${string}` | undefined;
      try {
        await assertPilot(); assertFundingQuote(funding, arc, address);
        const client = walletClient(arc, address);
        hash = kind === "approve"
          ? await client.writeContract({ address: arc.usdc, abi: erc20Abi, functionName: "approve", args: [arc.gatewayWallet, PILOT_DEPOSIT_ATOMIC], gas: BigInt(funding.approval_gas_limit), gasPrice: BigInt(funding.gas_price_wei) })
          : await client.writeContract({ address: arc.gatewayWallet, abi: gatewayDepositAbi, functionName: "deposit", args: [arc.usdc, PILOT_DEPOSIT_ATOMIC], gas: BigInt(funding.deposit_gas_limit), gasPrice: BigInt(funding.gas_price_wei) });
        localStorage.setItem(key, JSON.stringify({ status: "submitted", hash })); setFundingHash(hash);
        const publicClient = createPublicClient({ transport: custom(provider()) });
        await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
        await reconcileFunding(kind);
      } catch (error) {
        if (!hash && (error as { code?: number })?.code === 4001) localStorage.removeItem(key);
        throw error;
      }
    });
  }
  async function buy() {
    const address = await assertAccount();
    if (address.toLowerCase() !== seller.toLowerCase()) throw new Error("This pilot is pinned to the owner-confirmed test wallet shown below.");
    if (!consent) throw new Error("Approve the displayed one-query pilot budget before signing.");
    if (!paymentsEnabled) throw new Error("Payments are paused until hosting, storage and the spending budget are approved.");
    const chainId = await provider().request({ method: "eth_chainId" });
    if (Number(chainId) !== arc.chainId) throw new Error(`Switch your wallet to ${arc.name}, chain ${arc.chainId}, before paying.`);
    const health = await fetch("/api/health?store=1", { cache: "no-store" }).then(r => r.json());
    if (health.payment_store?.status !== "available" || health.payment_acceptance !== "enabled") throw new Error("Durable payment store is not ready. No payment attempted.");
    const balances = await fetch(`/api/gateway-balance?wallet=${address}`, { cache: "no-store" });
    const data = await balances.json();
    if (!balances.ok || !Number.isFinite(Number(data.gateway_available_usdc)) || Number(data.gateway_available_usdc) < Number(price)) {
      throw new Error("Gateway balance is insufficient or unverified. Any deposit needs a separate amount and gas approval.");
    }
    if (!navigator.locks) throw new Error("This browser cannot safely lock the single-payment budget. Use a current Chrome browser.");
    const key = `radar:pilot:v1:${arc.chainId}:${address.toLowerCase()}`;
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock || localStorage.getItem(key)) throw new Error("The pilot budget is already reserved or used. Query the receipt; do not authorize a new payment.");
      const id = crypto.randomUUID(); setRequestId(id);
      const endpoint = signalEndpoint(window.location.origin);
      const quote = await discoverSignal(endpoint, arc, seller, "1000", id);
      if (quote.offer.amountAtomic !== "1000" || price !== "0.001") throw new Error("Pilot quote must be exactly 0.001 USDC.");
      const reservation = { request_id: id, amount_usdc: "0.001", status: "pending", created_at: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(reservation));
      let signatureCreated = false;
      try {
        const client = walletClient(arc, address);
        const signer = new BatchEvmScheme({ address, async signTypedData(params) {
          await assertAccount();
          const signed = await client.signTypedData(params);
          signatureCreated = true;
          return signed;
        } });
        const purchase = await paySignal(endpoint, arc, quote, id, signer);
        localStorage.setItem(key, JSON.stringify({ ...reservation, status: "accepted", payment_reference: purchase.transaction }));
        setResult(purchase); setMessage("Signal received and digest verified. Gateway acceptance is not independent onchain confirmation.");
      } catch (error) {
        const rejected = !signatureCreated && (error as { code?: number })?.code === 4001;
        if (rejected) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ ...reservation, status: "unknown" }));
        throw error;
      }
    });
  }
  async function readBills(csv = false) {
    const address = await assertAccount();
    const url = new URL("/api/billing", window.location.origin);
    if (requestId.trim()) url.searchParams.set("request_id", requestId.trim());
    else url.searchParams.set("limit", "50");
    if (csv) url.searchParams.set("format", "csv");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await walletClient(arc, address).signMessage({
      message: billingMessage({ url: url.toString(), network: arc.network, wallet: address, timestamp }) });
    const response = await fetch(url, { cache: "no-store", redirect: "error", headers: {
      "x-radar-wallet": address, "x-radar-auth-timestamp": timestamp, "x-radar-auth-signature": signature } });
    if (!response.ok) throw new Error(response.status === 404 ? "Receipt not found for this wallet; do not create a replacement payment." : "Billing read failed. Check that storage is ready and your wallet read signature is valid.");
    if (csv) {
      const blob = await response.blob(); const href = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = href; a.download = "radar-agent-bills.csv"; a.click(); URL.revokeObjectURL(href);
    } else {
      const data = await response.json(); setBills(data.bills);
      setMessage(data.bills.length ? "Receipts loaded for the connected wallet." : "No receipts exist for this wallet. No payment was made by this query.");
    }
  }
  return <main>
    <nav><a className="brand" href="/">RADAR<span>•</span>AGENT</a><a href={mode === "pilot" ? "/billing" : "/pilot"}>{mode === "pilot" ? "My receipts" : "Payment pilot"}</a></nav>
    <section className="tool-shell">
      <p className="eyebrow">{arc.name.toUpperCase()} · {mode === "pilot" ? "ONE QUERY PILOT" : "WALLET RECEIPTS"}</p>
      <h1>{mode === "pilot" ? "One signal. One receipt." : "Your agent's spending."}</h1>
      <p className="lede">{mode === "pilot" ? "Buy one ETH market signal for 0.001 USDC using your wallet. The pilot preserves its budget if a response is lost." : "Read and export receipts using a wallet signature. This read authorization expires after five minutes and does not spend funds."}</p>
      <div className="tool-card">
        <p><b>Connected wallet</b><br/><code>{wallet ?? "Not connected"}</code></p>
        <button disabled={busy} onClick={() => run(connect)}>{wallet ? "Reconnect wallet / 重新连接" : "Connect wallet / 连接钱包"}</button>
        <button disabled={busy} onClick={() => run(chooseAccount)}>Choose account / 选择账户</button>
        <button disabled={busy || !wallet} onClick={() => run(disconnect)}>Disconnect wallet / 断开连接</button>
        {busy && <p role="status" className="tool-notice">处理中，请查看钱包扩展弹窗。Processing — check the wallet popup.</p>}
        {message && <p className="tool-notice" role="status">{message}</p>}
        {mode === "pilot" && <>
          <p><b>Approved pilot wallet / recipient</b><br/><code>{seller}</code></p>
          {wallet && !correctWallet && <p className="tool-notice" role="alert">当前钱包与测试地址不一致，充值和购买已阻止。请在钱包扩展切换到上面的完整地址，再点击重新连接。Wrong wallet selected; funding and purchase are blocked.</p>}
          {wallet && <p>当前网络 / Connected chain: <b>{connectedChainId ?? "Unknown"}</b> · 所需网络 / Required: {arc.name} ({arc.chainId})</p>}
          {wallet && !correctChain && <><p className="tool-notice">请先切换到 Arc 主网，链 ID 5042。Select the required network before funding or purchasing.</p><button disabled={busy} onClick={() => run(switchNetwork)}>Switch to {arc.name} / 切换网络</button></>}
          <p>Same-wallet functional test · one query maximum · no automatic deposits or treasury transfers.</p>
          <p>The payment signature authorizes exactly 0.001 USDC and remains valid for approximately seven days for Gateway batching.</p>
          {!paymentsEnabled && <p className="tool-notice">Payment pilot is paused. Discovery and wallet receipt reads remain available when storage is configured.</p>}
          <p>Optional funding: exactly 0.01 USDC into your own Gateway balance. Approval is limited to 0.01 USDC. Each of the two funding transactions is capped at 0.005 USDC gas; the combined gas cap is 0.01 USDC. The signal fee comes from the deposit. No recurring payments.</p>
          {!consent && <p className="tool-notice">购买按钮尚未启用：核对钱包、网络后，勾选下面的预算框。Tick the budget checkbox after checking your wallet and network.</p>}
          <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I approve this optional funding budget and one 0.001 USDC signal purchase.</label>
          <div className="tool-actions"><button disabled={busy || !correctWallet || !correctChain} onClick={() => run(reviewFunding)}>Review Gateway funding quote</button></div>
          {funding && <div className="tool-notice"><p>Deposit: <b>{funding.amount_usdc} USDC</b> · maximum gas for the remaining steps: <b>{funding.maximum_gas_usdc} USDC</b>. Quote expires in 60 seconds.</p>
            <p>{funding.approval_needed ? "Approval simulated. Deposit gas is a ceiling until approval confirms; review again to simulate the deposit." : "Deposit simulation passed."}</p>
            <button disabled={busy || !consent || !correctWallet || !correctChain} onClick={() => run(() => fund(funding.approval_needed ? "approve" : "deposit"))}>{funding.approval_needed ? "Approve exactly 0.01 USDC in wallet" : "Deposit exactly 0.01 USDC in wallet"}</button></div>}
          <div className="tool-actions"><button disabled={busy || !wallet} onClick={() => run(() => reconcileFunding("approve"))}>Reconcile approval</button>
            <button disabled={busy || !wallet} onClick={() => run(() => reconcileFunding("deposit"))}>Reconcile deposit</button></div>
          {fundingHash && <p>Funding transaction: <a href={`${arc.explorerUrl}/tx/${fundingHash}`} target="_blank" rel="noreferrer">{fundingHash}</a> (funding, not API fee settlement)</p>}
          <div className="tool-actions"><button disabled={busy || !wallet} onClick={() => run(checkBalance)}>Check Gateway balance</button>
          <button disabled={busy || !correctWallet || !correctChain || !paymentsEnabled || !consent} onClick={() => run(buy)}>Authorize one 0.001 USDC purchase</button></div>
          {balance !== undefined && <p>Available in Gateway: <b>{balance} USDC</b>. Wallet funds and Gateway funds are separate.</p>}
        </>}
      </div>
      <div className="tool-card">
        <h2>Query receipts</h2><p>Only the connected wallet's records are returned. Pending or unknown payments require reconciliation before another payment.</p>
        <label htmlFor="request-id">Request ID (optional)</label>
        <input id="request-id" value={requestId} onChange={event => setRequestId(event.target.value)} placeholder="Leave blank for the latest 50 receipts"/>
        <div className="tool-actions"><button disabled={busy || !wallet} onClick={() => run(() => readBills())}>Sign read request</button>
        <button disabled={busy || !wallet} onClick={() => run(() => readBills(true))}>Export CSV</button></div>
        {bills.length > 0 && <div className="table-scroll"><table><thead><tr><th>Created</th><th>USDC</th><th>Status</th><th>Signal</th><th>Request</th></tr></thead><tbody>{bills.map(bill => <tr key={bill.bill_id}><td>{bill.created_at}</td><td>{bill.amount_usdc}</td><td>{bill.status}</td><td>{bill.signal_id ?? "—"}</td><td><code>{bill.request_id}</code></td></tr>)}</tbody></table></div>}
      </div>
      {result !== undefined && <details open><summary>Validated signal and payment reference</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
      <p>Gateway-accepted receipts are labelled separately from independently confirmed chain transactions.</p>
    </section>
  </main>;
}

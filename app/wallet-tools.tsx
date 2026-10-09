"use client";
import { useState } from "react";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import { createWalletClient, custom, defineChain, type EIP1193Provider } from "viem";
import type { ArcConfig } from "@/lib/arc";
import type { Bill } from "@/lib/billing";
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
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [result, setResult] = useState<unknown>();
  const [balance, setBalance] = useState<string>();
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(safeError(error)); } finally { setBusy(false); }
  }
  async function connect() {
    const accounts = await provider().request({ method: "eth_requestAccounts" });
    const address = accounts[0];
    if (!address || !/^0x[\da-fA-F]{40}$/.test(address)) throw new Error("No wallet account was connected.");
    setWallet(address); setBalance(undefined); setBills([]); setResult(undefined);
    setMessage("Wallet connected. No payment has been authorized.");
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
  async function buy() {
    const address = await assertAccount();
    if (address.toLowerCase() !== seller.toLowerCase()) throw new Error("This pilot is pinned to the owner-confirmed test wallet shown below.");
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
        <button disabled={busy} onClick={() => run(connect)}>Connect wallet</button>
        {mode === "pilot" && <>
          <p><b>Approved pilot wallet / recipient</b><br/><code>{seller}</code></p>
          <p>Same-wallet functional test · one query maximum · no automatic deposits or treasury transfers.</p>
          <p>The payment signature authorizes exactly 0.001 USDC and remains valid for approximately seven days for Gateway batching.</p>
          {!paymentsEnabled && <p className="tool-notice">Payment pilot is paused. Discovery and wallet receipt reads remain available when storage is configured.</p>}
          <div className="tool-actions"><button disabled={busy || !wallet} onClick={() => run(checkBalance)}>Check Gateway balance</button>
          <button disabled={busy || !wallet || !paymentsEnabled} onClick={() => run(buy)}>Authorize one 0.001 USDC purchase</button></div>
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
      {message && <p className="tool-notice" role="status">{message}</p>}
      {result !== undefined && <details open><summary>Validated signal and payment reference</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
      <p>Gateway-accepted receipts are labelled separately from independently confirmed chain transactions.</p>
    </section>
  </main>;
}

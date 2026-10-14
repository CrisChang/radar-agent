import { getArcConfig } from "@/lib/arc";

export const dynamic = "force-dynamic";

const guards = [
  ["Spending checks", "Payment limits checked before signing"],
  ["Quote checks", "Network, asset, recipient and amount verified"],
  ["Recovery", "Saved responses and original-authorization replays"],
  ["Uncertain outcomes", "Reconciliation before new payments"],
  ["Evidence", "Acceptance and confirmed batches labelled separately"],
];

export default function Home() {
  const arc = getArcConfig();
  return (
    <main>
      <nav>
        <a className="brand" href="#top">
          RADAR<span>•</span>AGENT
        </a>
        <div className="tool-actions"><a href="/pilot">Payment pilot</a><a href="/billing">Receipts</a><a href="/validation">Mainnet validation</a><a href="/api/openapi">API docs</a></div>
        <div className="network">
          <i />
          {arc.name.toUpperCase()}
        </div>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow">MARKET DATA AND PAYMENT RECORDS FOR AGENTS</p>
        <h1>
          Agents buy signals,
          <br />
          with <em>recoverable receipts.</em>
        </h1>
        <p className="lede">
          USDC pay-per-query ETH and BTC observations for agents and developers,
          with spending checks, payment recovery and wallet-scoped receipts on
          Arc. Mainnet trading and treasury execution are disabled.
        </p>

        <div className="endpoint">
          <div>
            <span className="method">GET</span>
            <code>/api/signals/latest?symbol=ETH-USD</code>
          </div>
          <strong>${process.env.SIGNAL_PRICE_USDC ?? "0.001"} USDC</strong>
        </div>
      </section>

      <section className="flow">
        <article>
          <span>01</span>
          <h2>Observe</h2>
          <p>Read structured observations from the latest three Coinbase Exchange one-minute candles.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Pay</h2>
          <p>Check the quote, then authorize an exact USDC payment. Gateway settles accepted payments in batches.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Recover</h2>
          <p>Retrieve the original paid response after an interrupted request, with durable payment records.</p>
        </article>
        <article>
          <span>04</span>
          <h2>Audit</h2>
          <p>Read wallet-scoped receipts and export CSV. Distinguish payment acceptance from confirmed settlement.</p>
        </article>
      </section>

      <section className="discipline">
        <div>
          <p className="eyebrow">PAYMENT CONTROLS</p>
          <h2>Keep spending bounded.</h2>
          <p>
            The buyer checks quotes and budgets before signing. Durable
            reservations, receipt recovery and reconciliation help handle
            failures without treating every retry as a new purchase.
          </p>
        </div>
        <ul>
          {guards.map(([name, detail]) => (
            <li key={name}>
              <b>{name}</b>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="discipline" aria-labelledby="evidence-title">
        <div>
          <p className="eyebrow">MAINNET EVIDENCE</p>
          <h2 id="evidence-title">Proof you can inspect.</h2>
          <p>
            On October 12, two distinct owner-controlled wallets completed a
            0.001 USDC live ETH signal purchase, with response verification,
            receipt reads and a confirmed Arc settlement batch.
          </p>
          <div className="tool-actions">
            <a href="https://explorer.arc.io/tx/0xc407227af427e96af16521bff611e6719c68e6e26e6de9eefae8ee642bd7ed41">
              Inspect the confirmed API-fee batch
            </a>
            <a href="https://github.com/CrisChang/radar-agent/tree/codex/arc-microgrants">
              Source and evidence records
            </a>
          </div>
        </div>
        <div>
          <h3>1,000-payment reliability campaign</h3>
          <p>
            A staged test covers ten fixed payment amounts totaling 0.232600
            USDC, with funding gas accounted for separately. It exercises
            retries, response loss, client restarts and reconciliation through
            a dedicated test-receipt endpoint. These are test payments, not
            1,000 market-data purchases.
          </p>
          <p>
            Payments may share batch hashes. Gateway records provide per-payment
            attribution; Arc receipts independently verify aggregate wallet
            changes in each batch. The live report separates payment verification
            from scenario passes and retains observed failures.
          </p>
          <p>
            Both wallets are owner-controlled. The tests measure functionality
            and reliability; they do not establish customer revenue, adoption
            or production readiness. Final conclusions require complete
            reconciliation.
          </p>
          <div className="tool-actions">
            <a href="/validation">View current progress and evidence</a>
            <a href="/billing">Query wallet receipts</a>
          </div>
        </div>
      </section>

      <footer>
        Radar Agent · Built on Arc and Circle Gateway · Arc Microgrants prototype
      </footer>
    </main>
  );
}

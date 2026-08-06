import { ProofReplay } from "./proof-replay";
import { VERIFIED_ARC_PROOF } from "@/lib/proof";

const guards = [
  ["Daily caps", "Hard USDC limits before any signature"],
  ["Idempotency", "Pending actions are never replayed blindly"],
  ["Position safety", "Minimum reserve enforced before transfers"],
  ["Circuit breaker", "Three failures halt the agent"],
  ["Audit trail", "Signal → decision → settlement is traceable"],
];

export default function Home() {
  return (
    <main>
      <nav>
        <a className="brand" href="#top">
          RADAR<span>•</span>AGENT
        </a>
        <div className="network">
          <i />
          ARC TESTNET · VERIFIED
        </div>
      </nav>

      <section className="hero" id="top">
        <p className="eyebrow">PROGRAMMABLE MARKET INTELLIGENCE</p>
        <h1>
          Agents pay for signal,
          <br />
          then act with <em>discipline.</em>
        </h1>
        <p className="lede">
          Radar Agent turns live ETH and BTC price movement into an
          x402-paywalled feed. An autonomous buyer pays in USDC, evaluates an
          explainable rule and can rebalance a treasury through Circle App Kit.
        </p>

        <div className="endpoint">
          <div>
            <span className="method">GET</span>
            <code>/api/signals/latest?symbol=ETH-USD</code>
          </div>
          <strong>$0.001 USDC</strong>
        </div>
        <div className="hero-actions">
          <a href="#live-demo" className="primary-link">Run the public demo</a>
          <a href="/demo">Watch the 70-second video</a>
          <a
            href={VERIFIED_ARC_PROOF.settlement.explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            Inspect the Arc transaction ↗
          </a>
        </div>
      </section>

      <section className="proof-strip" aria-label="Verified results">
        <div><strong>$0.001</strong><span>x402 signal purchase</span></div>
        <div><strong>1 USDC</strong><span>Arc treasury settlement</span></div>
        <div><strong>5 / 5</strong><span>automated tests passing</span></div>
        <div><strong>5042002</strong><span>Arc Testnet chain ID</span></div>
      </section>

      <section className="flow">
        <article>
          <span>01</span>
          <h2>Observe</h2>
          <p>Build a two-minute alert from public Coinbase Exchange candles.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Pay</h2>
          <p>Circle Gateway verifies and batches a gasless x402 authorization.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Decide</h2>
          <p>A transparent threshold rule chooses rebalance or hold.</p>
        </article>
        <article>
          <span>04</span>
          <h2>Settle</h2>
          <p>Circle App Kit sends USDC to reserve when every guard approves.</p>
        </article>
      </section>

      <section className="discipline">
        <div>
          <p className="eyebrow">THE DISCIPLINE LAYER</p>
          <h2>Autonomy needs hard edges.</h2>
          <p>
            The model never gets custody policy. Deterministic code controls
            budget, replay protection and failure handling.
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

      <section className="live-demo" id="live-demo">
        <div className="section-heading">
          <p className="eyebrow">PUBLIC, SAFE, VERIFIABLE</p>
          <h2>Test the boundary. Inspect the proof.</h2>
          <p>
            This public demo never exposes custody credentials and never sends
            a new transfer. It verifies the live x402 boundary, then replays the
            recorded proof of the successful autonomous execution.
          </p>
        </div>
        <ProofReplay />
      </section>

      <section className="transaction-proof">
        <div>
          <p className="eyebrow">ONCHAIN RECEIPT</p>
          <h2>One decision. One guarded settlement.</h2>
        </div>
        <dl>
          <div><dt>Signal</dt><dd>sharp drop · −180 bps · 94% confidence</dd></div>
          <div><dt>x402 payment</dt><dd>0.001 USDC</dd></div>
          <div><dt>Treasury action</dt><dd>1 USDC to reserve</dd></div>
          <div><dt>Finality</dt><dd>success on Arc Testnet</dd></div>
          <div className="hash-row">
            <dt>Transaction</dt>
            <dd>{VERIFIED_ARC_PROOF.settlement.transaction}</dd>
          </div>
        </dl>
        <a
          className="proof-link"
          href={VERIFIED_ARC_PROOF.settlement.explorerUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open verified receipt on ArcScan ↗
        </a>
      </section>

      <footer>
        <span>Encode × Circle Programmable Money Hackathon · Agentic Economy</span>
        <div className="footer-links">
          <a href="/demo">Demo video</a>
          <a href="https://github.com/CrisChang/radar-agent" target="_blank" rel="noreferrer">
            Public source ↗
          </a>
        </div>
      </footer>
    </main>
  );
}

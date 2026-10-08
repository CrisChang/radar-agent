import { getArcConfig } from "@/lib/arc";

export const dynamic = "force-dynamic";

const guards = [
  ["Daily caps", "Hard USDC limits before any signature"],
  ["Idempotency", "Pending actions are never replayed blindly"],
  ["Position safety", "Minimum reserve enforced before transfers"],
  ["Circuit breaker", "Three failures halt the agent"],
  ["Audit trail", "Signal → decision → settlement is traceable"],
];

export default function Home() {
  const arc = getArcConfig();
  return (
    <main>
      <nav>
        <a className="brand" href="#top">
          RADAR<span>•</span>AGENT
        </a>
        <div className="network">
          <i />
          {arc.name.toUpperCase()}
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
          explainable rule and records an audit trail. Treasury rebalancing
          through Circle App Kit is an optional testnet demonstration.
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
          <h2>Audit</h2>
          <p>Track each signal, spending authorization and payment receipt.</p>
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

      <footer>
        Radar Agent · Built on Arc and Circle Gateway · Arc Microgrants prototype
      </footer>
    </main>
  );
}

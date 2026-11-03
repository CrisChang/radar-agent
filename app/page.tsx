import type { Metadata } from "next";
import SiteNav from "./site-nav";
import PaymentStory from "./payment-story";
import SkillEntry from "./skill-entry";
import { publicEvidence } from "@/lib/public-evidence";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Radar Agent — Know what your agent paid for",
  description: "Make every agent API payment traceable. Record the cost, delivered result and retries, then reconcile USDC payments on Arc. Start with the Radar Agent Skill.",
};

export default async function Home() {
  const { report } = await publicEvidence();
  const samples = ["response_loss_after_submit", "sequential", "client_restart", "concurrent_same_authorization_replay"]
    .flatMap(scenario => {
      const row = report.rows.find(row => row.scenario === scenario);
      return row ? [row] : [];
    });
  const date = report.generated_at ? new Date(report.generated_at).toISOString().slice(0, 10) : "Date unavailable";

  return <main className={styles.page}>
    <SiteNav />
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.grid} aria-hidden="true" />
      <p className={styles.eyebrow}><span /> PAYMENT ACCOUNTING FOR AGENTS</p>
      <h1 id="home-title">Know what your<br />agent <em>paid for.</em></h1>
      <p className={styles.intro}>The cost. The result. Every retry.<br />One clear record for each paid API call, from USDC payment to reconciliation.</p>
      <div className={styles.heroActions}>
        <a className={styles.primary} href="#connect">Connect your agent <span aria-hidden="true">↗</span></a>
        <a className={styles.secondary} href="#payment-trail">See a real payment <span aria-hidden="true">↓</span></a>
      </div>
      <p className={styles.heroNote}>USDC on Arc <span>·</span> Keys stay local <span>·</span> Original-payment recovery</p>
      <div className={styles.heroLine} aria-hidden="true"><i /><span /><i /><span /><i /></div>
    </section>

    <section id="payment-trail" className={styles.storySection} aria-label="Recorded payment walkthrough">
      <PaymentStory samples={samples} />
    </section>

    <section className={styles.proof} aria-labelledby="proof-title">
      <div className={styles.sectionIntro}>
        <div><p className={styles.eyebrow}>REAL PAYMENTS. OPEN RECORDS.</p><h2 id="proof-title">The numbers behind the trail.</h2></div>
        <a className={styles.textLink} href="/evidence">Inspect the full evidence ↗</a>
      </div>
      <div className={styles.metrics}>
        <div><strong>{report.completed_payments.toLocaleString("en-US")}<small> / 1,000</small></strong><span>Test payments reconciled</span></div>
        <div><strong>{report.batch_transactions}</strong><span>Shared Arc settlement batches</span></div>
        <div><strong>{report.money_difference_atomic === null ? "Pending" : report.money_difference_atomic}</strong><span>Max. batch wallet difference · USDC atomic units</span></div>
      </div>
      <p className={styles.scope}>Owner-controlled mainnet test · {date} · {report.scenario_verified_payments ?? 0}/1,000 payment + scenario passes.<br />Payment-test receipts, not customer revenue. Per-payment attribution comes from Gateway; chain checks verify shared batch wallet totals. Fees are separate.</p>
    </section>

    <section className={styles.valueSection} aria-label="What Radar Agent records">
      <div className={styles.valueRow}><span>01</span><div><h2>What did it cost?</h2><p>Keep the agreed price and budget reservation together. Separate the payment amount from gas and other costs.</p></div><b>Price → Payment</b></div>
      <div className={styles.valueRow}><span>02</span><div><h2>What did it receive?</h2><p>Connect the request to its saved response and verifiable digest. Keep payment acceptance distinct from chain settlement.</p></div><b>Request → Receipt</b></div>
      <div className={styles.valueRow}><span>03</span><div><h2>What happened on retry?</h2><p>Retain the original authorization and recover the same result. Keep uncertain outcomes visible instead of signing another payment.</p></div><b>Retry → Recovery</b></div>
    </section>

    <section id="connect" className={styles.connect} aria-labelledby="connect-title">
      <div className={styles.connectCopy}><p className={styles.eyebrow}>ONE STARTING POINT</p><h2 id="connect-title">Your agent reads.<br /><em>You stay in control.</em></h2><p>Give your agent the Radar Skill. It explains the API, receipt records and recovery rules, starting with checks that cost nothing.</p><div className={styles.connectMeta}><span>01 Read the Skill</span><span>02 Check for free</span><span>03 Approve any spend</span></div></div>
      <SkillEntry />
    </section>

    <section className={styles.faq} aria-labelledby="faq-title">
      <div><p className={styles.eyebrow}>A FEW CLEAR ANSWERS</p><h2 id="faq-title">Know the scope.</h2></div>
      <div className={styles.questions}>
        <details><summary>Is Radar Agent a trading bot?</summary><p>No. Radar records and recovers payments for agent API calls. A 0.001 USDC ETH observation is the working service example; Radar does not execute a trading strategy.</p></details>
        <details><summary>Does reading the Skill spend money?</summary><p>No. The first steps are an unpaid quote and an optional offline recovery demo. A live purchase requires an approved wallet and spending limit. The current owner-run reference client never funds the wallet automatically.</p></details>
        <details><summary>Does recovery work with any paid API?</summary><p>The reference integration supports Radar’s USDC API on Arc. Other providers must explicitly support original-authorization replay. Recovered content is the original result, which may be old; an unknown payment outcome is never treated as a free retry.</p></details>
        <details><summary>What did the 1,000-payment experiment prove?</summary><p>It reconciled owner-controlled test payments across ten amounts and six scenarios. The evidence page discloses supplemental receipt reads, the accelerated schedule, fees and timing limits. The newer client’s offline crash demo is a separate, synthetic test.</p></details>
      </div>
    </section>
    <footer className={styles.footer}><div><b>RADAR AGENT</b><span>Every API payment has a story. Keep the record.</span></div><a href="/integrate">Developer guide ↗</a><a href="https://github.com/CrisChang/radar-agent">Source ↗</a></footer>
  </main>;
}

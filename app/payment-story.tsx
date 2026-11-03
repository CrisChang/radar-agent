"use client";

import { useState } from "react";
import type { EvidenceRow } from "@/lib/public-evidence-types";
import styles from "./home.module.css";

const scenarios: Record<string, { label: string; title: string; description: string }> = {
  sequential: { label: "Normal call", title: "One call. One saved result.", description: "The request, payment and delivered response stay connected in one record." },
  response_loss_after_submit: { label: "Lost response", title: "The response was lost. The record wasn’t.", description: "A controlled response-loss test reused the original authorization to retrieve the saved result." },
  client_restart: { label: "Client restart", title: "The client restarted. The trail continued.", description: "The restart scenario retained the request identity and original authorization for recovery." },
  concurrent_same_authorization_replay: { label: "Concurrent retry", title: "Multiple attempts. One payment identity.", description: "Original-authorization attempts remain tied to the same recorded payment." },
};

export default function PaymentStory({ samples }: { samples: EvidenceRow[] }) {
  const [selected, setSelected] = useState(0);
  const row = samples[selected];
  if (!row) return <div className={styles.story}><h2>Recorded evidence is unavailable.</h2><a href="/evidence">Check the evidence report →</a></div>;
  const scenario = scenarios[row.scenario] ?? { label: row.scenario, title: "A recorded payment.", description: "Inspect the retained record and its settlement evidence." };
  const verified = row.proof === "provider_attribution_and_chain_aggregate_verified";
  const hasDigest = Boolean(row.response_sha256);
  return <div className={styles.story}>
    <div className={styles.storyTop}><p className={styles.eyebrow}><span /> RECORDED MAINNET TEST</p><span className={styles.storyMode}>Read-only walkthrough · no payment</span></div>
    <div className={styles.scenarioButtons} role="group" aria-label="Choose a recorded scenario">
      {samples.map((sample, index) => <button key={sample.intent} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>{scenarios[sample.scenario]?.label ?? sample.scenario}</button>)}
    </div>
    <div className={styles.storyBody} aria-live="polite">
      <div className={styles.storyCopy}>
        <h2>{scenario.title}</h2><p>{scenario.description}</p>
        <ol className={styles.timeline}>
          <li><span className={styles.step}>01</span><div><b>Price recorded</b><small>{row.amount_usdc} USDC planned principal</small></div><span className={styles.check}>✓</span></li>
          <li><span className={styles.step}>02</span><div><b>Attempts retained</b><small>{row.http_attempts} HTTP {row.http_attempts === 1 ? "attempt" : "attempts"} · one logical payment</small></div><span className={styles.check}>✓</span></li>
          <li><span className={styles.step}>03</span><div><b>Result {hasDigest ? "saved" : "pending"}</b><small>{hasDigest ? "Response SHA-256 retained" : "No response digest in this record"}</small></div><span className={styles.check}>{hasDigest ? "✓" : "—"}</span></li>
          <li><span className={styles.step}>04</span><div><b>Settlement {verified ? "reconciled" : "pending"}</b><small>{verified ? "Gateway attribution + Arc batch wallet totals" : "Independent chain verification not complete"}</small></div><span className={styles.check}>{verified ? "✓" : "—"}</span></li>
        </ol>
      </div>
      <div className={styles.receipt}>
        <div className={styles.receiptTop}><span>PAYMENT RECORD</span><span className={styles.receiptBadge}>{verified ? "Reconciled" : "Pending"}</span></div>
        <div className={styles.receiptAmount}>{row.amount_usdc}<small>USDC</small></div>
        <p className={styles.receiptSubtitle}>Recorded principal · fees separate</p>
        <dl>
          <div><dt>Request</dt><dd>{row.intent}</dd></div>
          <div><dt>Gateway status</dt><dd>{row.transfer_status ?? "Unknown"}</dd></div>
          <div><dt>HTTP attempts</dt><dd>{row.http_attempts}</dd></div>
          <div><dt>Scenario evidence</dt><dd>{row.scenario_passed === true ? "Passed" : row.scenario_passed === false ? "Not passed" : "Pending"}</dd></div>
          <div><dt>Batch wallet difference</dt><dd>{row.money_difference_atomic === null ? "Pending" : `${row.money_difference_atomic} atomic units`}</dd></div>
        </dl>
        <div className={styles.receiptHash}><span>ARC SETTLEMENT BATCH</span>{row.batch_hash ? <a href={`https://explorer.arc.io/tx/${row.batch_hash}`} target="_blank" rel="noreferrer">{row.batch_hash.slice(0, 14)}…{row.batch_hash.slice(-8)} ↗</a> : <p>Awaiting batch hash</p>}</div>
        <a className={styles.receiptLink} href={`/evidence?intent=${encodeURIComponent(row.intent)}`}>Inspect this record <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <p className={styles.storyFoot}>{row.concurrent_evidence === "settled_receipt_replay" ? "This sample includes supplemental reads of an already-settled receipt, not an initial settlement race. " : ""}Owner-controlled payment-test content. A batch can contain multiple payments.</p>
  </div>;
}

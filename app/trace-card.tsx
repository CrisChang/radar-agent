"use client";
import { useState } from "react";
import type { EvidenceRow } from "@/lib/public-evidence-types";
const names:Record<string,string>={sequential:"Normal request",response_loss_after_submit:"Lost response",client_restart:"Client restart",concurrent_same_authorization_replay:"Concurrent retry"};
const stages=["Plan","Authorize","Deliver","Reconcile"];
export default function TraceCard({samples}:{samples:EvidenceRow[]}){
 const [selected,setSelected]=useState(0),[stage,setStage]=useState(3),row=samples[selected];
 if(!row)return null;
 const descriptions=[
  `The frozen plan sets an exact ${row.amount_usdc} USDC charge. Budget reservations remain separate from funding and gas.`,
  "The original authorization and logical request identity are retained. Recovery does not silently create a replacement nonce.",
  `The saved response has a verifiable SHA-256 digest. ${row.http_attempts} observed HTTP attempts still belong to this one payment.`,
  row.proof==="provider_attribution_and_chain_aggregate_verified"?"Gateway attribution is matched to a successful Arc batch. The aggregate wallet amount difference is exactly zero.":"Independent chain evidence is still pending for this payment."];
 return <aside className="trace-card" aria-label="Explore a real payment-test receipt"><div className="trace-heading"><span className="live-dot"/> MAINNET / RECORDED EVIDENCE<span className="trace-counter">01 → 04</span></div>
  <h2>Follow a real request.</h2><p className="trace-intro">Switch the scenario. Inspect the same accounting path.</p>
  <div className="trace-select"><label htmlFor="trace-scenario">SCENARIO</label><select id="trace-scenario" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{samples.map((s,i)=><option key={s.intent} value={i}>{names[s.scenario]??s.scenario}</option>)}</select></div>
  <div className="trace-stages">{stages.map((s,i)=><button key={s} aria-pressed={stage===i} onClick={()=>setStage(i)}><span>{String(i+1).padStart(2,"0")}</span>{s}</button>)}</div>
  <div className="trace-detail" aria-live="polite"><div><span>{row.intent}</span><strong>{row.amount_usdc}<small> USDC</small></strong></div><p>{descriptions[stage]}</p></div>
  <dl className="trace-facts"><div><dt>Payment</dt><dd className="verified-tag">{row.transfer_status}</dd></div><div><dt>Scenario evidence</dt><dd>{row.scenario_passed?"Passed":"Still open"}</dd></div><div><dt>Response SHA-256</dt><dd><code>{row.response_sha256?.slice(0,18)}…</code></dd></div><div><dt>Arc batch</dt><dd>{row.batch_hash?<a href={`https://explorer.arc.io/tx/${row.batch_hash}`} target="_blank" rel="noreferrer">{row.batch_hash.slice(0,16)}… ↗</a>:"Pending"}</dd></div></dl>
  <a className="trace-open" href={`/evidence?intent=${row.intent}`}>Open the complete evidence →</a><p className="trace-scope">Owner-controlled payment-test receipt · shared batch attribution</p>
 </aside>;
}

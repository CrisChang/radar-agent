"use client";

import { useState } from "react";
import styles from "./home.module.css";

export const skillUrl = "https://radar-agent-ivory.vercel.app/skills/radar-agent/SKILL.md";
const instructions = `Read ${skillUrl} and help me integrate Radar Agent for traceable API payments. Start with the free quote and offline recovery demo. Do not make a payment or ask me to send a private key.`;

export default function SkillEntry({ showGuide = true }: { showGuide?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(instructions); setStatus("copied"); }
    catch { setStatus("manual"); }
  }
  return <div className={styles.skillCard}>
    <div className={styles.skillHeading}><span className={styles.skillIcon} aria-hidden="true">↗</span><div><b>Radar Agent Skill</b><span>Plain Markdown. Ready for your agent.</span></div><span className={styles.fileBadge}>.md</span></div>
    <label htmlFor="agent-instructions">Paste this into your coding agent</label>
    <textarea id="agent-instructions" readOnly value={instructions} spellCheck={false} onFocus={event => event.currentTarget.select()} />
    <button className={styles.copyButton} type="button" onClick={() => void copy()}>{status === "copied" ? "Instructions copied ✓" : "Copy agent instructions"}<span aria-hidden="true">↗</span></button>
    <p className={styles.copyStatus} role="status">{status === "copied" ? "Paste into your agent. The first steps do not spend funds." : status === "manual" ? "Clipboard unavailable. Select and copy the instructions above." : "No wallet or payment needed to get started."}</p>
    <div className={styles.skillLinks}><a href="/skills/radar-agent/SKILL.md">Read the Skill ↗</a>{showGuide && <a href="/integrate">Developer guide →</a>}</div>
  </div>;
}

import styles from "./site-nav.module.css";

export default function SiteNav() {
  return <nav className={styles.nav} aria-label="Main navigation">
    <a className={styles.brand} href="/" aria-label="Radar Agent home"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M16 16 25 7M16 4v3M4 16h3M16 25v3M25 16h3" stroke="currentColor" strokeWidth="1.4"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg><span>radar<span className={styles.brandLight}>agent</span></span></a>
    <div className={styles.links}><a href="/skills/radar-agent/SKILL.md">Agent Skill</a><a href="/evidence">Evidence</a><a href="https://github.com/CrisChang/radar-agent">GitHub ↗</a></div>
    <a className={styles.start} href="/#connect">Get started <span aria-hidden="true">↗</span></a>
  </nav>;
}

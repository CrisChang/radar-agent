import type { Metadata } from "next";
import Link from "next/link";
import { VERIFIED_ARC_PROOF } from "@/lib/proof";

const DEMO_VIDEO_URL =
  "https://raw.githubusercontent.com/CrisChang/radar-agent/main/public/demo/radar-agent-demo.mp4";

export const metadata: Metadata = {
  title: "Radar Agent — 70-second demo",
  description:
    "Watch Radar Agent buy an x402 signal, apply deterministic guards and settle a treasury action on Arc Testnet.",
};

export default function DemoVideoPage() {
  return (
    <main className="video-page">
      <nav>
        <Link className="brand" href="/">
          RADAR<span>•</span>AGENT
        </Link>
        <div className="network"><i />70-SECOND DEMO</div>
      </nav>
      <section className="video-intro">
        <p className="eyebrow">FINAL SUBMISSION VIDEO</p>
        <h1>Watch the complete agent cycle.</h1>
        <p className="lede">
          A concise walkthrough of the two-sided x402 market, deterministic
          safety layer and verified Arc Testnet settlement.
        </p>
      </section>
      <section className="video-shell">
        <video controls playsInline preload="metadata" poster="/og.png">
          <source src={DEMO_VIDEO_URL} type="video/mp4" />
          Your browser does not support HTML5 video.
        </video>
        <div className="video-links">
          <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
            Open MP4 ↗
          </a>
          <a
            href={VERIFIED_ARC_PROOF.settlement.explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            Inspect Arc receipt ↗
          </a>
          <Link href="/#live-demo">Run public demo</Link>
        </div>
      </section>
      <footer>
        <span>Encode × Circle Programmable Money Hackathon</span>
        <Link href="/">Back to Radar Agent</Link>
      </footer>
    </main>
  );
}

"use client";

import { useState } from "react";

type CheckState = "idle" | "loading" | "success" | "error";

interface ProofResponse {
  proof: {
    signal: { magnitudeBps: number; confidence: number };
    payment: { amountUsdc: number; transaction: string };
    decision: { action: string };
    settlement: { amountUsdc: number; explorerUrl: string; state: string };
    guards: readonly string[];
  };
}

export function ProofReplay() {
  const [paywallState, setPaywallState] = useState<CheckState>("idle");
  const [paywallMessage, setPaywallMessage] = useState(
    "No payment or wallet signature will be sent.",
  );
  const [proofState, setProofState] = useState<CheckState>("idle");
  const [proof, setProof] = useState<ProofResponse["proof"] | null>(null);

  async function verifyPaywall() {
    setPaywallState("loading");
    setPaywallMessage("Requesting the public signal endpoint…");
    try {
      const response = await fetch("/api/signals/latest?demo=sharp_drop", {
        cache: "no-store",
      });
      if (response.status !== 402) {
        throw new Error(`Expected HTTP 402, received ${response.status}`);
      }
      const requirement = response.headers.get("payment-required");
      if (!requirement) {
        throw new Error("The payment-required header is missing");
      }
      setPaywallState("success");
      setPaywallMessage(
        "Verified live: HTTP 402 with a Circle Gateway payment requirement.",
      );
    } catch (error) {
      setPaywallState("error");
      setPaywallMessage(
        error instanceof Error ? error.message : "Unable to verify the paywall",
      );
    }
  }

  async function replayProof() {
    setProofState("loading");
    try {
      const response = await fetch("/api/proof", { cache: "no-store" });
      if (!response.ok) throw new Error(`Proof endpoint returned ${response.status}`);
      const payload = (await response.json()) as ProofResponse;
      setProof(payload.proof);
      setProofState("success");
    } catch {
      setProofState("error");
    }
  }

  return (
    <div className="demo-grid">
      <article className="demo-control">
        <p className="step-label">LIVE ENDPOINT CHECK</p>
        <h3>Verify the x402 boundary</h3>
        <p>
          Call the deployed seller without a wallet. A correct deployment must
          refuse access with HTTP 402 and advertise the payment requirement.
        </p>
        <button type="button" onClick={verifyPaywall} disabled={paywallState === "loading"}>
          {paywallState === "loading" ? "Checking…" : "Verify x402 paywall"}
        </button>
        <div className={`result result-${paywallState}`} aria-live="polite">
          <span>{paywallState === "success" ? "PASS" : paywallState.toUpperCase()}</span>
          {paywallMessage}
        </div>
      </article>

      <article className="demo-control demo-control-dark">
        <p className="step-label">VERIFIED ARC EXECUTION</p>
        <h3>Replay the completed agent cycle</h3>
        <p>
          Load the immutable proof captured after the agent paid, decided,
          passed every guard and settled on Arc Testnet.
        </p>
        <button type="button" onClick={replayProof} disabled={proofState === "loading"}>
          {proofState === "loading" ? "Loading proof…" : "Replay verified cycle"}
        </button>
        {proofState === "error" && (
          <div className="result result-error" aria-live="polite">
            <span>ERROR</span>Unable to load the public proof endpoint.
          </div>
        )}
        {proof && (
          <ol className="proof-steps" aria-live="polite">
            <li><b>Observe</b><span>{proof.signal.magnitudeBps} bps · {(proof.signal.confidence * 100).toFixed(0)}% confidence</span></li>
            <li><b>Pay</b><span>{proof.payment.amountUsdc} USDC · x402 Gateway</span></li>
            <li><b>Decide</b><span>{proof.decision.action.replaceAll("_", " ")}</span></li>
            <li><b>Guard</b><span>{proof.guards.length} deterministic checks passed</span></li>
            <li><b>Settle</b><span>{proof.settlement.amountUsdc} USDC · {proof.settlement.state}</span></li>
          </ol>
        )}
      </article>
    </div>
  );
}


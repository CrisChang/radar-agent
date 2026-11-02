import type { PriceSignal } from "./signals";

export interface DecisionConfig {
  minMagnitudeBps: number;
  minConfidence: number;
  rebalancePct: number;
}

export interface AgentDecision {
  action: "rebalance_to_reserve" | "hold";
  reason: string;
  rebalancePct: number;
}

export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  minMagnitudeBps: 150,
  minConfidence: 0.9,
  rebalancePct: 0.2,
};

export function decide(
  signal: PriceSignal,
  config = DEFAULT_DECISION_CONFIG,
): AgentDecision {
  if (signal.feed_status === "stale") {
    return {
      action: "hold",
      reason: "Feed is stale; position safety forbids treasury movement.",
      rebalancePct: 0,
    };
  }

  if (
    signal.type === "sharp_drop" &&
    Math.abs(signal.magnitude_bps) >= config.minMagnitudeBps &&
    signal.confidence >= config.minConfidence
  ) {
    return {
      action: "rebalance_to_reserve",
      reason:
        `Sharp drop ${signal.magnitude_bps} bps with ` +
        `${signal.confidence.toFixed(3)} confidence meets the ` +
        `${config.minMagnitudeBps} bps / ${config.minConfidence} rule.`,
      rebalancePct: config.rebalancePct,
    };
  }

  return {
    action: "hold",
    reason:
      `Signal does not meet the sharp-drop rule: ` +
      `${signal.magnitude_bps} bps, confidence ${signal.confidence.toFixed(3)}.`,
    rebalancePct: 0,
  };
}


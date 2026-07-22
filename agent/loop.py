"""Radar Agent main loop (skeleton — x402 client and App Kits execution land in week 3).

wake -> preflight -> buy signal -> decide -> authorize -> execute -> audit -> reconcile
"""

from pathlib import Path

from discipline import SpendingCap, IdempotencyGuard, CircuitBreaker, AuditLog
from signals.schema import PriceSignal

STATE_DIR = Path(__file__).parent / "state"

# Decision rules are deliberately explainable: threshold rules over real signals,
# not an opaque model. The judge (and the operator) can read why money moved.
REBALANCE_RULE = {"type": "sharp_drop", "min_magnitude_bps": 150, "min_confidence": 0.9}
REBALANCE_PCT = 0.20


def decide(signal: PriceSignal) -> str | None:
    r = REBALANCE_RULE
    if (
        signal.type == r["type"]
        and abs(signal.magnitude_bps) >= r["min_magnitude_bps"]
        and signal.confidence >= r["min_confidence"]
    ):
        return "rebalance_to_reserve"
    return None


def run_once() -> None:
    STATE_DIR.mkdir(exist_ok=True)
    caps = SpendingCap(STATE_DIR / "spend.json", {"data": 1.00, "treasury": 100.00})
    idem = IdempotencyGuard(STATE_DIR / "actions.json")
    breaker = CircuitBreaker(STATE_DIR / "breaker.json")
    audit = AuditLog(STATE_DIR / "audit.jsonl")

    breaker.preflight()

    # --- week-3: x402 nanopayment purchase from the seller API goes here ---
    # signal = x402_client.buy_latest_signal()  # pays USDC per query
    # caps.authorize("data", price); caps.record("data", price)
    # audit.log("signal_purchased", signal_id=signal.signal_id, price_usdc=price)

    # --- week-3: App Kits execution goes here ---
    # action = decide(signal)
    # if action:
    #     key = idem.key(signal.ts[:10], signal.signal_id, action)
    #     idem.check(key)
    #     caps.authorize("treasury", amount)
    #     tx = app_kits.rebalance(REBALANCE_PCT)
    #     idem.record(key); caps.record("treasury", amount)
    #     audit.log("action_executed", key=key, tx=tx)

    breaker.record_success()


if __name__ == "__main__":
    run_once()

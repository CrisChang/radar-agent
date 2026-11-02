"""Consecutive failures or anomalous conditions halt the agent until a human resets it."""

import json
import datetime
from pathlib import Path


class Halted(Exception):
    pass


class CircuitBreaker:
    def __init__(self, state_path: Path, max_consecutive_failures: int = 3):
        self.state_path = state_path
        self.max_failures = max_consecutive_failures
        self._state = (
            json.loads(state_path.read_text())
            if state_path.exists()
            else {"failures": 0, "halted": False, "halted_reason": None}
        )

    def preflight(self) -> None:
        """Call before every cycle. Raises Halted if the breaker is open."""
        if self._state["halted"]:
            raise Halted(f"agent halted: {self._state['halted_reason']} — human reset required")

    def record_success(self) -> None:
        self._state["failures"] = 0
        self._save()

    def record_failure(self, reason: str) -> None:
        self._state["failures"] += 1
        if self._state["failures"] >= self.max_failures:
            self.halt(f"{self._state['failures']} consecutive failures, last: {reason}")
        else:
            self._save()

    def halt(self, reason: str) -> None:
        self._state["halted"] = True
        self._state["halted_reason"] = (
            f"{reason} @ {datetime.datetime.now(datetime.timezone.utc).isoformat()}"
        )
        self._save()

    def reset(self) -> None:
        """Human-only operation (CLI), never called by the agent loop."""
        self._state = {"failures": 0, "halted": False, "halted_reason": None}
        self._save()

    def _save(self) -> None:
        self.state_path.write_text(json.dumps(self._state, indent=2))

"""Hard daily budgets, enforced locally before anything is signed."""

import json
import datetime
from pathlib import Path


class CapExceeded(Exception):
    pass


class SpendingCap:
    """Separate daily budgets per category (data purchases vs. treasury moves).

    State is persisted so a restarted agent cannot forget what it spent.
    """

    def __init__(self, state_path: Path, caps_usdc: dict[str, float]):
        self.state_path = state_path
        self.caps = caps_usdc  # e.g. {"data": 1.00, "treasury": 100.00}
        self._state = self._load()

    def _load(self) -> dict:
        if self.state_path.exists():
            return json.loads(self.state_path.read_text())
        return {}

    def _today(self) -> str:
        return datetime.datetime.now(datetime.timezone.utc).date().isoformat()

    def spent(self, category: str) -> float:
        return self._state.get(self._today(), {}).get(category, 0.0)

    def authorize(self, category: str, amount_usdc: float) -> None:
        """Raises CapExceeded if this spend would breach the daily cap."""
        cap = self.caps.get(category)
        if cap is None:
            raise CapExceeded(f"no cap configured for category '{category}' — refusing")
        if self.spent(category) + amount_usdc > cap:
            raise CapExceeded(
                f"{category}: spent {self.spent(category):.6f} + {amount_usdc:.6f} "
                f"would exceed daily cap {cap:.6f} USDC"
            )

    def record(self, category: str, amount_usdc: float) -> None:
        day = self._state.setdefault(self._today(), {})
        day[category] = day.get(category, 0.0) + amount_usdc
        self.state_path.write_text(json.dumps(self._state, indent=2))

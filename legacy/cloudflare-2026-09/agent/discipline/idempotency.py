"""Deterministic action keys: the same decision can never execute twice."""

import json
from pathlib import Path


class DuplicateAction(Exception):
    pass


class IdempotencyGuard:
    """Persisted set of executed action keys.

    Keys are deterministic: f(date, signal_id, action_type). A crashed and
    restarted agent will refuse to re-execute an action it already performed.
    """

    def __init__(self, state_path: Path):
        self.state_path = state_path
        self._seen: set[str] = set(
            json.loads(state_path.read_text()) if state_path.exists() else []
        )

    @staticmethod
    def key(date: str, signal_id: str, action_type: str) -> str:
        return f"{date}:{signal_id}:{action_type}"

    def check(self, key: str) -> None:
        if key in self._seen:
            raise DuplicateAction(f"action already executed: {key}")

    def record(self, key: str) -> None:
        self._seen.add(key)
        self.state_path.write_text(json.dumps(sorted(self._seen)))

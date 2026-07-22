"""Append-only audit trail: every entry links signal -> decision -> transaction."""

import json
import datetime
from pathlib import Path


class AuditLog:
    def __init__(self, path: Path):
        self.path = path

    def log(self, event: str, **fields) -> None:
        entry = {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "event": event,
            **fields,
        }
        with self.path.open("a") as f:
            f.write(json.dumps(entry, sort_keys=True) + "\n")

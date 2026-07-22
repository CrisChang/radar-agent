"""Signal schema — mirrors the format of a production price-radar pipeline."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PriceSignal:
    signal_id: str      # e.g. "pr-2026-07-22-000123"
    ts: str             # ISO-8601 UTC
    type: str           # "sharp_drop" | "drawdown" | "threshold_cross"
    symbol: str         # e.g. "ETH-USD"
    magnitude_bps: int  # signed basis points over the window
    window_s: int       # observation window in seconds
    confidence: float   # 0..1

    @classmethod
    def from_json(cls, d: dict) -> "PriceSignal":
        return cls(**{k: d[k] for k in cls.__dataclass_fields__})

import { createHash } from "node:crypto";

export type SignalType =
  | "sharp_drop"
  | "drawdown"
  | "threshold_cross"
  | "stable";

export type FeedStatus = "live" | "stale" | "demo";

export interface PriceSignal {
  signal_id: string;
  ts: string;
  type: SignalType;
  symbol: string;
  magnitude_bps: number;
  window_s: number;
  confidence: number;
  price: number;
  reference_price: number;
  source: string;
  feed_status: FeedStatus;
}

// Coinbase Exchange candle: [time, low, high, open, close, volume].
export type CoinbaseCandle = [
  number,
  number,
  number,
  number,
  number,
  number,
];

const COINBASE_API = "https://api.exchange.coinbase.com";
const ALLOWED_SYMBOLS = new Set(["ETH-USD", "BTC-USD"]);
let lastLiveSignal: PriceSignal | undefined;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function signalId(symbol: string, timestampSeconds: number): string {
  const digest = createHash("sha256")
    .update(`${symbol}:${timestampSeconds}`)
    .digest("hex")
    .slice(0, 10);
  const day = new Date(timestampSeconds * 1_000).toISOString().slice(0, 10);
  return `pr-${day}-${digest}`;
}

export function buildSignalFromCandles(
  symbol: string,
  rawCandles: CoinbaseCandle[],
): PriceSignal {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    throw new Error(`unsupported symbol: ${symbol}`);
  }
  if (rawCandles.length < 3) {
    throw new Error("at least three one-minute candles are required");
  }

  const candles = [...rawCandles]
    .sort((a, b) => a[0] - b[0])
    .slice(-3);
  const first = candles[0];
  const latest = candles[candles.length - 1];
  const referencePrice = Number(first[3]);
  const price = Number(latest[4]);

  if (
    !Number.isFinite(referencePrice) ||
    !Number.isFinite(price) ||
    referencePrice <= 0 ||
    price <= 0
  ) {
    throw new Error("market feed returned invalid prices");
  }

  const magnitudeBps = Math.round(
    ((price - referencePrice) / referencePrice) * 10_000,
  );
  const totalVolume = candles.reduce(
    (sum, candle) => sum + Math.max(0, Number(candle[5])),
    0,
  );
  const confidence = clamp(
    0.82 + Math.min(Math.abs(magnitudeBps) / 2_000, 0.13) +
      (totalVolume > 0 ? 0.03 : 0),
    0,
    0.98,
  );

  let type: SignalType = "stable";
  if (magnitudeBps <= -150) type = "sharp_drop";
  else if (magnitudeBps < 0) type = "drawdown";
  else if (magnitudeBps >= 100) type = "threshold_cross";

  return {
    signal_id: signalId(symbol, latest[0]),
    ts: new Date(latest[0] * 1_000).toISOString(),
    type,
    symbol,
    magnitude_bps: magnitudeBps,
    window_s: Math.max(60, latest[0] - first[0] + 60),
    confidence: Number(confidence.toFixed(3)),
    price: Number(price.toFixed(2)),
    reference_price: Number(referencePrice.toFixed(2)),
    source: "coinbase-exchange-candles",
    feed_status: "live",
  };
}

export function buildDemoSignal(
  symbol = "ETH-USD",
  now = new Date(),
): PriceSignal {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    throw new Error(`unsupported symbol: ${symbol}`);
  }
  const timestampSeconds = Math.floor(now.getTime() / 1_000);
  return {
    signal_id: signalId(`${symbol}:demo`, timestampSeconds),
    ts: now.toISOString(),
    type: "sharp_drop",
    symbol,
    magnitude_bps: -180,
    window_s: 120,
    confidence: 0.94,
    price: 2_946.9,
    reference_price: 3_000,
    source: "radar-judged-demo-fixture",
    feed_status: "demo",
  };
}

function fallbackSignal(symbol: string, now = new Date()): PriceSignal {
  if (lastLiveSignal?.symbol === symbol) {
    return {
      ...lastLiveSignal,
      feed_status: "stale",
      confidence: Math.min(lastLiveSignal.confidence, 0.75),
    };
  }

  const timestampSeconds = Math.floor(now.getTime() / 1_000);
  return {
    signal_id: signalId(`${symbol}:unavailable`, timestampSeconds),
    ts: now.toISOString(),
    type: "stable",
    symbol,
    magnitude_bps: 0,
    window_s: 120,
    confidence: 0,
    price: 0,
    reference_price: 0,
    source: "coinbase-unavailable-safe-fallback",
    feed_status: "stale",
  };
}

export async function getLatestSignal(
  symbol = "ETH-USD",
): Promise<PriceSignal> {
  if (!ALLOWED_SYMBOLS.has(symbol)) {
    throw new Error(`unsupported symbol: ${symbol}`);
  }

  const end = new Date();
  const start = new Date(end.getTime() - 4 * 60 * 1_000);
  const url = new URL(`/products/${symbol}/candles`, COINBASE_API);
  url.searchParams.set("granularity", "60");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        "user-agent": "radar-agent/0.1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`Coinbase feed returned HTTP ${response.status}`);
    }
    const candles = (await response.json()) as CoinbaseCandle[];
    const signal = buildSignalFromCandles(symbol, candles);
    lastLiveSignal = signal;
    return signal;
  } catch (error) {
    console.error(
      "[signal-feed] live feed unavailable; returning a safe non-actionable signal:",
      error instanceof Error ? error.message : error,
    );
    return fallbackSignal(symbol);
  }
}

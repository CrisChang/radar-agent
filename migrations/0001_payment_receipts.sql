-- Apply to a NEW staging database first. Never delete testnet history.
-- Authorization signatures are deliberately excluded from storage.
CREATE TABLE IF NOT EXISTS payment_receipts (
  payment_key TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('preparing', 'settling', 'accepted', 'unknown', 'rejected')),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_receipts_state ON payment_receipts(state, updated_at);

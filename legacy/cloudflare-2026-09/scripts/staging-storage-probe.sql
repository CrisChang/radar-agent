-- Synthetic storage check ONLY. This is not a payment receipt or user record.
-- Run only against radar-payments-staging, never the historical demo or production.
CREATE TABLE IF NOT EXISTS radar_staging_probe (
  probe_id TEXT PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification = 'synthetic_storage_only'),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO radar_staging_probe (probe_id, classification, payload, created_at)
VALUES ('2026-09-20-deployment-probe', 'synthetic_storage_only',
  'Radar staging persistence check: no signature, payment, signal delivery or chain transaction.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT DO NOTHING;
SELECT probe_id, classification, payload, created_at FROM radar_staging_probe
WHERE probe_id = '2026-09-20-deployment-probe';
SELECT COUNT(*) AS payment_receipt_rows FROM payment_receipts;

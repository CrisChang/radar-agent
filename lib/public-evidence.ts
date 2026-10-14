import snapshot from "../data/mainnet-report.json";
import audit from "../data/mainnet-audit.json";
import { validationStore } from "./validation-store";
import type { EvidenceReport } from "./public-evidence-types";
export async function publicEvidence(options: { fullAudit?: boolean } = {}) {
 let report = snapshot as EvidenceReport, source = "saved_snapshot";
 try { const saved = await validationStore()?.report(); if (saved && Array.isArray(saved.rows)) { report = saved as unknown as EvidenceReport; source = "live_saved_reconciliation"; } } catch { /* Display the dated snapshot, never infer a new pass. */ }
 const { rows: _rows, batches: _batches, ...summary } = audit;
 return { report, audit: options.fullAudit ? audit : summary, source };
}

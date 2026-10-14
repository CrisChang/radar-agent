import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { hashTypedData } from "viem";
import { getArcConfig } from "./arc";
import { validateHandoffBundle, handoffDigest, stageThreeRows, type HandoffBundle } from "./validation-handoff";
import { validateSigningPermits, type SigningPermit } from "./validation-local-policy";
import { campaignTypedData, inspectCampaignPayment } from "./validation-authorization";
import { readPrivateJson, writePrivateJson } from "./validation-local-files";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, plannedPayment } from "./validation-plan";
import type { PrivateJournal } from "./validation-runner";
import type { CampaignState } from "./validation-store";
import { validateTimingAmendment } from "./validation-timing";
export class LocalRecoveryError extends Error {}
type PublicRow = { intent: string; stage: number; local_state: string; http_attempts: number; response_sha256?: string | null; transfer_status?: string | null; money_difference_atomic?: string | null };
export interface RecoveryStatus { state?: CampaignState; report?: { attempted_payments?: number; completed_payments?: number; money_difference_atomic?: string | null; generated_at?: string; rows?: PublicRow[] } }
export interface UnsignedRecoveryDependencies { status(): Promise<RecoveryStatus>; now?: () => number }
/** Caller holds the original runner lock. Read-only network calls; never signs,
 * changes permits, deletes a journal or submits a payment. */
export async function recoverUnsignedJournal(bundle: HandoffBundle, root: string, intent: string, deps: UnsignedRecoveryDependencies) {
  const now = deps.now ?? Date.now, row = plannedPayment(intent), path = join(root, `${intent}.json`);
  validateHandoffBundle(bundle);
  if (row.stage !== 3) throw new LocalRecoveryError("只能核查本机接管后的第三阶段未签名记录。");
  const names = await readdir(root);
  if (names.some(n => n.endsWith(".pending"))) throw new LocalRecoveryError("存在未完成落盘文件；无法证明签名未生成。原文件保留，请先核查。");
  if (names.some(n => /^planned-.*\.json$/.test(n) && !stageThreeRows().some(p => `${p.planned_intent_id}.json` === n))) throw new LocalRecoveryError("本机目录存在范围外账单；保留原文件核查。");
  const original = await readPrivateJson<PrivateJournal>(path);
  if (!original || original.state !== "signing" || original.paymentHeader !== undefined || original.nonce !== undefined ||
      original.responseHash !== undefined || original.pendingRenewal !== undefined || original.renewals?.length || original.lastFailure !== undefined ||
      !Array.isArray(original.attempts) || original.attempts.some(a => a.outcome !== "wallet_rejected_before_signature"))
    throw new LocalRecoveryError("该记录不属于已证明未提交的签名中断；不会重置或补签，请保留原授权核查。");
  // Only the transient state differs from a valid unsigned journal.
  try { validateHandoffBundle({ ...bundle, journals: [{ ...original, state: "unsigned_interrupted" }] }); }
  catch { throw new LocalRecoveryError("中断记录的原付款编号、金额或双方地址不符；无法恢复。"); }
  const permitsPath = join(root, ".signing-permits.json");
  let permits: SigningPermit[];
  try {
    const raw = await readPrivateJson<SigningPermit[]>(permitsPath);
    if (!raw) throw new Error();
    permits = validateSigningPermits(raw);
  } catch { throw new LocalRecoveryError("签名保留记录缺失、损坏或权限不符；不能根据缺失文件认定未签名。"); }
  if (permits.some(p => p.intent === intent)) throw new LocalRecoveryError("这笔已有签名保留记录，即使账单没有签名也不能重新开始。需按原授权进一步核查。");
  const bundleHash = await handoffDigest(bundle);
  function inspect(status: RecoveryStatus) {
    const s = status.state, report = status.report;
    if (!s || s.stage !== 3 || s.executionMode !== "local" || s.runnerId !== bundle.runnerId || s.bundleHash !== bundleHash ||
        s.handoffCount !== bundle.reservedCount || s.halted || s.expiresAt <= now() || s.maximumCount !== 1000 || s.maximumAtomic !== "232600" ||
        s.reservedCount !== row.ordinal - 1 || s.reservedCount < bundle.reservedCount)
      throw new LocalRecoveryError("服务端预留、执行端或预算不符；请先做只读核查，不能重新开始这笔。");
    if (s.timingAmendment) validateTimingAmendment(s.timingAmendment, s.stage3StartedAt);
    if (!report || report.completed_payments !== s.reservedCount || report.attempted_payments !== s.reservedCount ||
        report.money_difference_atomic !== "0" || !Array.isArray(report.rows) || report.rows.length !== 1000 ||
        !Number.isFinite(Date.parse(report.generated_at ?? ""))) throw new LocalRecoveryError("已有付款尚未完整链上核实为零差异；请先只读核查。");
    const rows = report.rows, ids = new Set(rows.map(r => r.intent));
    if (ids.size !== 1000 || PAYMENT_SCHEDULE.some(p => !ids.has(p.planned_intent_id)))
      throw new LocalRecoveryError("服务端报告编号不完整；无法恢复。");
    for (const p of stageThreeRows()) {
      const observed = rows.find(r => r.intent === p.planned_intent_id);
      if (!observed || observed.stage !== 3) throw new LocalRecoveryError("服务端报告编号不完整；无法恢复。");
      if (p.ordinal >= row.ordinal && (observed.local_state !== "not_run" || observed.http_attempts !== 0 || observed.response_sha256))
        throw new LocalRecoveryError("这笔或后续已有请求/付款痕迹；不能作为未签名记录重置。");
    }
    return { state: s, rows };
  }
  const first = inspect(await deps.status()), scope = JSON.stringify(first.state);
  const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
  const prior = stageThreeRows().filter(p => p.ordinal < row.ordinal);
  if (permits.length !== prior.length) throw new LocalRecoveryError("签名保留数量与既有记录不一致；不能证明这笔尚未签名。");
  for (const p of stageThreeRows()) {
    const j = await readPrivateJson<PrivateJournal>(join(root, `${p.planned_intent_id}.json`));
    if (p.ordinal > row.ordinal && j) throw new LocalRecoveryError("后续存在本机记录；请先核查，不覆盖历史。");
    if (p.ordinal >= row.ordinal) continue;
    const observed = first.rows.find(r => r.intent === p.planned_intent_id), permit = permits.find(x => x.intent === p.planned_intent_id);
    if (!j || j.state !== "accepted" || !j.paymentHeader || !permit || observed?.local_state !== "accepted" ||
        observed.transfer_status !== "completed" || observed.money_difference_atomic !== "0" || !j.responseHash || j.responseHash !== observed.response_sha256)
      throw new LocalRecoveryError("已有账单、链上核查或签名保留记录不一致；原文件保留。");
    try {
      validateHandoffBundle({ ...bundle, journals: [j] });
      const auth = inspectCampaignPayment(j.paymentHeader, p, { arc, origin: bundle.origin, payer: bundle.payer, seller: bundle.seller }).payload.authorization;
      if (hashTypedData(campaignTypedData(auth, arc)) !== permit.digest) throw new Error();
    } catch { throw new LocalRecoveryError("已有原授权与签名保留摘要不符；不能恢复新付款。"); }
  }
  if (JSON.stringify(inspect(await deps.status()).state) !== scope) throw new LocalRecoveryError("核查期间服务端状态变化；请重新只读核查，不重发付款。");
  if ((await readdir(root)).some(n => n.endsWith(".pending")) || JSON.stringify(await readPrivateJson(path)) !== JSON.stringify(original) ||
      JSON.stringify(await readPrivateJson(permitsPath)) !== JSON.stringify(permits)) throw new LocalRecoveryError("核查期间本机文件变化；已停止，原文件保留。");
  const backupPath = join(root, `.unsigned-recovery-${intent}.json`), backup = { schema: "radar-unsigned-recovery-v1", campaign: CAMPAIGN_ID, intent,
    checkedAt: new Date(now()).toISOString(), serverReservedCount: first.state.reservedCount, signingPermitAbsent: true, original };
  // An interrupted earlier recovery may have committed the backup. Never overwrite it.
  const existingBackup = await readPrivateJson<typeof backup>(backupPath);
  if (existingBackup && (existingBackup.schema !== backup.schema || existingBackup.intent !== intent ||
      JSON.stringify(existingBackup.original) !== JSON.stringify(original))) throw new LocalRecoveryError("原恢复备份冲突；不会覆盖。");
  if (!existingBackup) await writePrivateJson(backupPath, backup);
  await writePrivateJson(path, { ...original, state: "unsigned_interrupted",
    attempts: [...original.attempts, { at: new Date(now()).toISOString(), outcome: "local_signer_not_issued_after_interruption" }] } satisfies PrivateJournal);
  return { intent, status: "unsigned_interruption_recovered", priorPayments: first.state.reservedCount, payment_attempted: false, private_key_read: false };
}

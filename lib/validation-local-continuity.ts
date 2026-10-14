import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { hashTypedData } from "viem";
import { getArcConfig } from "./arc";
import { campaignTypedData, inspectCampaignPayment } from "./validation-authorization";
import { validateHandoffBundle, stageThreeRows, type HandoffBundle } from "./validation-handoff";
import { readPrivateJson } from "./validation-local-files";
import { validateSigningPermits, type SigningPermit } from "./validation-local-policy";
import type { PrivateJournal } from "./validation-runner";

export class LocalContinuityError extends Error {}
/** Read-only preflight before prompting for a private key. A handoff is a frozen
 * browser snapshot, not a backup of later local execution. Never infer an old
 * authorization from a server receipt or silently skip missing local records. */
export async function checkLocalContinuity(bundle: HandoffBundle, root: string, reservedCount: number) {
  validateHandoffBundle(bundle);
  if (!Number.isInteger(reservedCount) || reservedCount < bundle.reservedCount || reservedCount > 1000)
    throw new LocalContinuityError("服务端预留数量与原接管范围不符，请先只读核查。");
  let exists = true;
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new LocalContinuityError("本机账单目录权限不符或是链接；请完整迁移原目录，不覆盖原记录。");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false; else throw error; }
  const names = exists ? await readdir(root) : [], rows = stageThreeRows();
  if (names.some(n => n.endsWith(".pending"))) throw new LocalContinuityError("发现未完成落盘文件；请保留原目录核查，不能续跑。");
  if (names.some(n => /^planned-.*\.json$/.test(n) && !rows.some(r => `${r.planned_intent_id}.json` === n)))
    throw new LocalContinuityError("账单目录含范围外付款编号；请保留原记录核查。");
  let permits: SigningPermit[] | null;
  try { const raw = exists ? await readPrivateJson<SigningPermit[]>(join(root, ".signing-permits.json")) : null; permits = raw === null ? null : validateSigningPermits(raw); }
  catch { throw new LocalContinuityError("签名保留记录损坏或权限不符；请从已停止的旧机器完整迁移，不能重新生成。"); }
  const journals = new Map<string, PrivateJournal>();
  for (const row of rows) {
    const imported = bundle.journals.find(j => j.intent === row.planned_intent_id);
    let local: PrivateJournal | null;
    try { local = exists ? await readPrivateJson<PrivateJournal>(join(root, `${row.planned_intent_id}.json`)) : null; }
    catch { throw new LocalContinuityError(`${row.planned_intent_id} 本机记录格式或权限不符；请保留原文件核查。`); }
    const j = local ?? imported;
    if (!j && row.ordinal <= reservedCount)
      throw new LocalContinuityError(`缺少 ${row.planned_intent_id} 的本机原账单；后台已预留 ${reservedCount} 笔，原接管包只覆盖至第 ${bundle.reservedCount} 笔。请停止旧机器并迁移整个运行目录（含隐藏的 .signing-permits.json），不要重新签名或重建接管包。`);
    if (!j) continue;
    if (j.state === "signing" && !j.paymentHeader && !j.nonce)
      throw new LocalContinuityError(`${j.intent} 本机账单校验：停在签名中且未保存授权；请在完整原目录运行 --repair-unsigned ${j.intent}，不能直接续跑。`);
    try { validateHandoffBundle({ ...bundle, journals: [j] }); }
    catch { throw new LocalContinuityError(`${row.planned_intent_id} 本机原授权未通过校验；不会生成替代授权。`); }
    if (imported?.paymentHeader && (j.paymentHeader !== imported.paymentHeader || j.nonce !== imported.nonce))
      throw new LocalContinuityError(`${row.planned_intent_id} 与原接管包授权冲突；不覆盖历史记录。`);
    if (row.ordinal <= reservedCount && !j.paymentHeader)
      throw new LocalContinuityError(`${row.planned_intent_id} 已预留但原授权缺失；请迁移完整原记录。`);
    if (j.state === "accepted" && !/^[a-f0-9]{64}$/i.test(j.responseHash ?? ""))
      throw new LocalContinuityError(`${row.planned_intent_id} 成功账单摘要缺失；请保留原记录核查。`);
    const permit = permits?.find(p => p.intent === j.intent);
    if (j.paymentHeader) {
      // Browser-imported entries may not have a local guard until the first
      // execution. Every authorization made after handoff must retain its guard.
      if (!permit && (row.ordinal > bundle.reservedCount || permits !== null))
        throw new LocalContinuityError(`${j.intent} 缺少签名保留记录；请完整迁移隐藏文件，不能重新签名。`);
      if (permit) {
        const arc = getArcConfig({ ARC_NETWORK: "mainnet" });
        const a = inspectCampaignPayment(j.paymentHeader, row, { arc, origin: bundle.origin, payer: bundle.payer, seller: bundle.seller }).payload.authorization;
        if (hashTypedData(campaignTypedData(a, arc)) !== permit.digest)
          throw new LocalContinuityError(`${j.intent} 原授权与签名保留摘要不一致；请保留原文件核查。`);
      }
    } else if (permit) throw new LocalContinuityError(`${j.intent} 有签名保留记录但授权缺失；不能重新签名。`);
    journals.set(j.intent, j);
  }
  if (permits?.some(p => !journals.get(p.intent)?.paymentHeader))
    throw new LocalContinuityError("签名保留文件中存在没有对应原授权的记录；请迁移完整目录后核查。");
  return { reservedCount, journalCount: journals.size, acceptedCount: [...journals.values()].filter(j => j.state === "accepted").length };
}

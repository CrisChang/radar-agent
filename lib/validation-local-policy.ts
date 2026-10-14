import { hashTypedData } from "viem";
import { getArcConfig } from "./arc";
import { CAMPAIGN_AUTH_TYPES, CAMPAIGN_AUTH_WINDOW_SECONDS, campaignTypedData, type CampaignAuthorization } from "./validation-authorization";
import { plannedPayment, STAGES } from "./validation-plan";
import { RUNNER_PAYER, RUNNER_SELLER, type HandoffBundle } from "./validation-handoff";
import { effectiveDueTime, type TimingState } from "./validation-timing";
export interface SigningPermit { intent: string; digest: string; authorization: CampaignAuthorization }
export function localSigningPermit(intent: string, params: ReturnType<typeof campaignTypedData>, bundle: HandoffBundle, startedAt: number | TimingState, now = Date.now()): SigningPermit {
  const row = plannedPayment(intent), arc = getArcConfig({ ARC_NETWORK: "mainnet" });
  if (row.stage !== 3 || effectiveDueTime(row, typeof startedAt === "number" ? { stage3StartedAt: startedAt } : startedAt) > now || !params || params.primaryType !== "TransferWithAuthorization" ||
      params.domain.name !== "GatewayWalletBatched" || params.domain.version !== "1" || Number(params.domain.chainId) !== 5042 ||
      params.domain.verifyingContract.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
      Object.keys(params.types).length !== 1 || JSON.stringify(params.types.TransferWithAuthorization) !== JSON.stringify(CAMPAIGN_AUTH_TYPES.TransferWithAuthorization)) throw new Error("本机签名范围不符。");
  const m = params.message, a: CampaignAuthorization = { from: m.from, to: m.to, value: String(m.value), validAfter: String(m.validAfter), validBefore: String(m.validBefore), nonce: m.nonce };
  const seconds = BigInt(Math.floor(now / 1000));
  if (Object.keys(m).sort().join() !== "from,nonce,to,validAfter,validBefore,value" || a.from.toLowerCase() !== bundle.payer.toLowerCase() ||
      a.to.toLowerCase() !== bundle.seller.toLowerCase() || a.value !== row.amount_atomic || !/^0x[0-9a-f]{64}$/i.test(a.nonce) ||
      BigInt(a.validAfter) < 0n || BigInt(a.validAfter) > seconds || BigInt(a.validBefore) < seconds + 604800n ||
      BigInt(a.validBefore) > seconds + BigInt(CAMPAIGN_AUTH_WINDOW_SECONDS + 30)) throw new Error("本机签名金额、地址或有效期不符。");
  return { intent, digest: hashTypedData(campaignTypedData(a, arc)), authorization: a };
}
export function validateSigningPermits(permits: SigningPermit[]) {
  if (!Array.isArray(permits) || permits.length > 900) throw new Error("签名保留记录不完整。");
  const ids = new Set<string>(), nonces = new Set<string>(), arc = getArcConfig({ ARC_NETWORK: "mainnet" });
  let amount = 0n;
  for (const p of permits) {
    const row = plannedPayment(p.intent), a = p.authorization;
    if (row.stage !== 3 || ids.has(p.intent) || !a || a.from?.toLowerCase() !== RUNNER_PAYER || a.to?.toLowerCase() !== RUNNER_SELLER.toLowerCase() ||
        a.value !== row.amount_atomic || !/^0x[0-9a-f]{64}$/i.test(a.nonce) || nonces.has(a.nonce.toLowerCase()) ||
        !/^\d{1,10}$/.test(a.validAfter) || !/^\d{1,10}$/.test(a.validBefore) || BigInt(a.validBefore) <= BigInt(a.validAfter) ||
        p.digest !== hashTypedData(campaignTypedData(a, arc))) throw new Error("签名保留记录损坏或范围不符；禁止重新签名。");
    ids.add(p.intent); nonces.add(a.nonce.toLowerCase()); amount += BigInt(row.amount_atomic);
  }
  if (amount > BigInt(STAGES[2].amountAtomic)) throw new Error("签名保留记录超过固定预算。");
  return permits;
}
export function addSigningPermit(existing: SigningPermit[], permit: SigningPermit) {
  validateSigningPermits(existing); validateSigningPermits([permit]);
  const prior = existing.find(x => x.intent === permit.intent);
  if (prior) { if (prior.digest !== permit.digest) throw new Error("同一笔已有不同签名记录，禁止新 nonce 或新授权。"); return existing; }
  if (existing.some(x => x.authorization.nonce.toLowerCase() === permit.authorization.nonce.toLowerCase())) throw new Error("授权 nonce 重复。");
  const next = [...existing, permit];
  if (next.length > 900 || next.reduce((n, x) => n + BigInt(plannedPayment(x.intent).amount_atomic), 0n) > BigInt(STAGES[2].amountAtomic)) throw new Error("本机签名超过固定阶段预算。");
  return next;
}

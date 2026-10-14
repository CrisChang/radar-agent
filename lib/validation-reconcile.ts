import { createHash } from "node:crypto";
import { createPublicClient, http, decodeAbiParameters, decodeFunctionData, decodeEventLog, parseAbi, toEventSelector, type Hex } from "viem";
import { getArcConfig, getPilotBuyerAddress, getSellerAddress } from "./arc";
import type { PaymentRecord } from "./payment-store";
import { decodeProtocolJson } from "./protocol";
import { CAMPAIGN_ID, PAYMENT_SCHEDULE, SCHEDULE_SHA256 } from "./validation-plan";
import type { CampaignEvent, CampaignState, ValidationStore } from "./validation-store";

import { timingEvidence } from "./validation-timing";

export interface GatewayTransfer {
  id: string; status: string; token: string; sendingNetwork: string; recipientNetwork: string;
  fromAddress: string; toAddress: string; amount: string; nonce: string; txHash?: string;
}
// Circle's public contract definitions (Batches.sol and BatchedDelta.sol).
export const BATCH_ABI = parseAbi([
  "function submitBatch(bytes calldataBytes, bytes signature)",
  "event BatchProcessed(bytes32 indexed batchId, address indexed signer, address indexed tokenAddress)",
  "event InsufficientBalance(address indexed token, address indexed depositor, uint256 requested, uint256 fromAvailable, uint256 fromWithdrawing)",
]);
const DELTA_PARAMS = [{ type: "tuple[]", components: [{ name: "depositor", type: "address" }, { name: "value", type: "int256" }] },
  { type: "bytes32" }, { type: "uint32" }, { type: "address" }, { type: "address" }] as const;
export function decodeBatch(input: Hex) {
  const decoded = decodeFunctionData({ abi: BATCH_ABI, data: input });
  if (decoded.functionName !== "submitBatch") throw new Error("Unsupported Gateway batch transaction");
  const [deltas, batchId, domain, token, gateway] = decodeAbiParameters(DELTA_PARAMS, decoded.args[0]);
  if (domain !== 26 || token.toLowerCase() !== getArcConfig().usdc.toLowerCase() ||
      gateway.toLowerCase() !== getArcConfig().gatewayWallet.toLowerCase() ||
      !deltas.length || deltas.some(d => d.value === 0n) || deltas.reduce((s, d) => s + d.value, 0n) !== 0n) throw new Error("Invalid Gateway batch domain, token, target or net balance");
  return { batchId, deltas };
}
export async function searchAllTransfers(fetcher: typeof fetch = fetch): Promise<GatewayTransfer[]> {
  const arc = getArcConfig(), byId = new Map<string, GatewayTransfer>();
  // Include outside-campaign movements involving either wallet. A shared batch
  // may net other payments; comparing only our campaign would be misleading.
  for (const address of [getPilotBuyerAddress(), getSellerAddress()]) for (const direction of ["from", "to"]) {
    let cursor: string | undefined;
    const seen = new Set<string>(), ids = new Set<string>();
    for (let page = 0; ; page++) {
      if (page >= 1000) throw new Error("Gateway pagination limit reached; incomplete history is not a pass");
      const url = new URL(`${arc.facilitatorUrl}/v1/x402/transfers`);
      url.searchParams.set(direction, address); url.searchParams.set("network", arc.network);
      url.searchParams.set("token", "USDC"); url.searchParams.set("pageSize", "100");
      if (cursor) url.searchParams.set("pageAfter", cursor);
      const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Gateway transfer history unavailable");
      const body = await response.json() as { transfers?: GatewayTransfer[]; pagination?: { pageAfter?: string } };
      if (!Array.isArray(body.transfers)) throw new Error("Malformed Gateway history");
      for (const t of body.transfers) {
        if (!t || typeof t.id !== "string" || !/^[1-9]\d*$/.test(t.amount) || !/^0x[\da-f]{64}$/i.test(t.nonce) ||
            !/^0x[\da-f]{40}$/i.test(t.fromAddress) || !/^0x[\da-f]{40}$/i.test(t.toAddress) ||
            t.token !== "USDC" || !["received", "batched", "confirmed", "completed", "failed"].includes(t.status)) throw new Error("Malformed Gateway transfer");
        if (ids.has(t.id)) throw new Error("Gateway pagination repeated a transfer");
        ids.add(t.id);
        const old = byId.get(t.id);
        if (old && JSON.stringify(old) !== JSON.stringify(t)) throw new Error("Gateway history changed during reconciliation; retry read only");
        byId.set(t.id, t);
      }
      const next = response.headers.get("link")?.split(",").find(s => /rel="?next"?/.test(s))?.match(/<([^>]+)>/)?.[1];
      cursor = next ? new URL(next, url).searchParams.get("pageAfter") ?? undefined : body.pagination?.pageAfter;
      if (!cursor) break;
      if (seen.has(cursor)) throw new Error("Gateway pagination cursor repeated");
      seen.add(cursor);
    }
  }
  return [...byId.values()];
}
export function matchTransfer(record: PaymentRecord, transfers: GatewayTransfer[]) {
  const auth = record.authorization!, terms = record.terms!;
  const matches = transfers.filter(t => t.nonce.toLowerCase() === auth.nonce.toLowerCase() && t.fromAddress.toLowerCase() === auth.payer.toLowerCase());
  if (matches.length > 1) throw new Error("Duplicate Gateway charge for one authorization");
  const transfer = matches[0];
  if (!transfer) return null;
  if (transfer.amount !== terms.amountAtomic || transfer.toAddress.toLowerCase() !== terms.payTo.toLowerCase() ||
      transfer.token !== "USDC" || transfer.sendingNetwork !== auth.network || transfer.recipientNetwork !== auth.network) throw new Error("Gateway amount or parties differ from the local receipt");
  if (record.state === "accepted") {
    if (!record.response?.headers["payment-response"] || record.response.headers["x-radar-response-sha256"] !== createHash("sha256").update(record.response.body).digest("hex")) throw new Error("Stored response digest is missing or differs");
    const receipt = decodeProtocolJson(record.response.headers["payment-response"]) as { success?: unknown; transaction?: unknown; network?: unknown; payer?: unknown };
    const reference = typeof receipt.transaction === "string" ? receipt.transaction : "";
    if (receipt.success !== true || receipt.network !== auth.network || String(receipt.payer).toLowerCase() !== auth.payer.toLowerCase() ||
        !((/^[\da-f-]{36}$/i.test(reference) && reference === transfer.id) || (/^0x[\da-f]{64}$/i.test(reference) && reference.toLowerCase() === transfer.txHash?.toLowerCase()))) throw new Error("Gateway reference or receipt scope differs from the local receipt");
  }
  return transfer;
}
export function batchWalletDifference(deltas: readonly { depositor: string; value: bigint }[], transfers: GatewayTransfer[], hash: string, wallet: string) {
  const chain = deltas.filter(d => d.depositor.toLowerCase() === wallet.toLowerCase()).reduce((s, d) => s + d.value, 0n);
  const provider = transfers.filter(t => t.txHash?.toLowerCase() === hash.toLowerCase() && ["confirmed", "completed"].includes(t.status)).reduce((s, t) =>
    s + (t.toAddress.toLowerCase() === wallet.toLowerCase() ? BigInt(t.amount) : 0n) -
    (t.fromAddress.toLowerCase() === wallet.toLowerCase() ? BigInt(t.amount) : 0n), 0n);
  return { chain: chain.toString(), provider: provider.toString(), difference: (chain - provider).toString() };
}
export async function verifyBatch(hash: Hex, transfers: GatewayTransfer[]) {
  const arc = getArcConfig(), client = createPublicClient({ transport: http(arc.rpcUrl, { retryCount: 0, timeout: 15_000 }) });
  if (await client.getChainId() !== 5042) throw new Error("Wrong RPC chain");
  const [receipt, tx, head] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash }), client.getBlockNumber()]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (receipt.status !== "success" || tx.to?.toLowerCase() !== arc.gatewayWallet.toLowerCase() ||
      receipt.to?.toLowerCase() !== arc.gatewayWallet.toLowerCase() || receipt.blockHash !== block.hash ||
      tx.blockHash !== block.hash || head < receipt.blockNumber + 2n) throw new Error("Batch lacks three canonical confirmations or has failed");
  const decoded = decodeBatch(tx.input);
  let processed = false;
  for (const log of receipt.logs.filter(l => l.address.toLowerCase() === arc.gatewayWallet.toLowerCase())) {
    if (log.topics[0] === toEventSelector("InsufficientBalance(address,address,uint256,uint256,uint256)")) throw new Error("insufficient_balance_in_batch");
    try {
      const event = decodeEventLog({ abi: BATCH_ABI, topics: log.topics, data: log.data });
      if (event.eventName === "InsufficientBalance") throw new Error("insufficient_balance_in_batch");
      if (event.eventName === "BatchProcessed" && event.args.batchId === decoded.batchId && event.args.tokenAddress.toLowerCase() === arc.usdc.toLowerCase()) processed = true;
    } catch (e) { if (e instanceof Error && e.message === "insufficient_balance_in_batch") throw e; }
  }
  if (!processed) throw new Error("Matching BatchProcessed event missing");
  const buyer = batchWalletDifference(decoded.deltas, transfers, hash, getPilotBuyerAddress());
  const seller = batchWalletDifference(decoded.deltas, transfers, hash, getSellerAddress());
  return { hash, block_number: receipt.blockNumber.toString(), block_hash: receipt.blockHash,
    buyer, seller, passed: buyer.difference === "0" && seller.difference === "0",
    attribution: "Gateway nonce-to-transfer-to-batch; independently decoded aggregate wallet deltas" };
}
/** Later overlapping attempts may complete a scenario; earlier failures remain.
 * Both the append-only ledger order and finite server intervals must overlap.
 * Supplemental receipt reads additionally require two successful cached responses. */
export function concurrentEvidence(record: PaymentRecord, events: CampaignEvent[]) {
  const pairs = events.flatMap((start, index) => {
    if (start.type !== "attempt_started" || !start.attemptId || start.intent !== record.campaign?.intent || start.fingerprint !== record.fingerprint) return [];
    if (events.filter(e => e.type === "attempt_started" && e.attemptId === start.attemptId).length !== 1) return [];
    const ends = events.map((end, endIndex) => ({ end, endIndex })).filter(({ end }) => end.type === "attempt_finished" && end.attemptId === start.attemptId);
    if (ends.length !== 1) return [];
    const { end, endIndex } = ends[0], from = Date.parse(start.at), to = Date.parse(end.at);
    if (endIndex <= index || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) return [];
    return [{ start, end, index, endIndex, from, to }];
  });
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const a = pairs[i], b = pairs[j];
    if (Math.max(a.index, b.index) >= Math.min(a.endIndex, b.endIndex) || Math.max(a.from, b.from) >= Math.min(a.to, b.to) ||
        ![a.end.status, b.end.status].includes(200)) continue;
    const supplemental = a.start.attemptKind === "settled_receipt_replay" || b.start.attemptKind === "settled_receipt_replay";
    if (supplemental && ![a, b].every(p => p.start.attemptKind === "settled_receipt_replay" && p.end.status === 200 && p.end.state === "replayed")) continue;
    return supplemental ? "settled_receipt_replay" : "payment_endpoint_attempts";
  }
  return null;
}
export function scenarioEvidence(scenario: string, record: PaymentRecord, events: CampaignEvent[]) {
  const starts = events.filter(e => e.type === "attempt_started" && e.intent === record.campaign?.intent && e.fingerprint === record.fingerprint);
  const finishes = events.filter(e => e.type === "attempt_finished" && starts.some(s => s.attemptId === e.attemptId));
  const success = finishes.filter(e => e.status === 200).length;
  const observedReplay = finishes.some(e => e.status === 200 && e.state === "replayed");
  if (scenario === "sequential" || scenario === "spread_sessions") return success >= 1;
  if (scenario === "serial_same_authorization_replay") return success >= 2 && observedReplay;
  if (scenario === "concurrent_same_authorization_replay") {
    return concurrentEvidence(record, events) !== null;
  }
  if (scenario === "response_loss_after_submit") return starts.length >= 2 && success >= 1 && observedReplay && starts.some(e => e.clientAction === "discard_response");
  if (scenario === "client_restart") return starts.length >= 2 && success >= 1 && observedReplay && new Set(starts.map(e => e.clientBootId).filter(Boolean)).size >= 2 && starts.some(e => e.clientAction === "restore_after_restart");
  return false;
}
export function emptyReport() {
  return { campaign_id: CAMPAIGN_ID, schedule_sha256: SCHEDULE_SHA256, status: "not_run", completed_payments: 0,
    attempted_payments: 0, http_attempts: 0, batch_transactions: 0, money_difference_atomic: null,
    overall_passed: null, generated_at: null, independent_customer_revenue: false, rows: [], batches: [],
    conclusion: "Mainnet campaign has not started. The earlier single-payment pilot is excluded." };
}
export async function reconcileCampaign(store: ValidationStore, state: CampaignState): Promise<{ report: Record<string, unknown>; digest: string }> {
  const records = await store.allRecords();
  if (records.length !== state.reservedCount) throw new Error("Campaign index count differs from the reserved count");
  const transfers = await searchAllTransfers();
  const matched = records.map(record => ({ record, transfer: matchTransfer(record, transfers) }));
  const hashes = [...new Set(matched.flatMap(x => x.transfer?.status === "completed" && /^0x[\da-f]{64}$/i.test(x.transfer.txHash ?? "") ? [x.transfer!.txHash!] : []))];
  const batches = [];
  for (const hash of hashes) batches.push(await verifyBatch(hash as Hex, transfers));
  const batchMap = new Map(batches.map(b => [b.hash.toLowerCase(), b]));
  let recovered = false;
  for (const item of matched) {
    const batch = item.transfer?.txHash ? batchMap.get(item.transfer.txHash.toLowerCase()) : undefined;
    if (["settling", "unknown"].includes(item.record.state) && item.transfer?.status === "completed" && batch?.passed) {
      await store.recoverPrepared(item.record, item.transfer.id); recovered = true;
    }
  }
  if (recovered) return reconcileCampaign(store, (await store.state())!);
  let eventCount = 0, attempts = 0;
  const allEvents: CampaignEvent[] = [];
  const attemptCounts = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const events = await store.events(offset, 1000); eventCount += events.length; allEvents.push(...events as CampaignEvent[]);
    for (const event of events as { type?: string; intent?: string }[]) if (event.type === "attempt_started") {
      attempts++; if (event.intent) attemptCounts.set(event.intent, (attemptCounts.get(event.intent) ?? 0) + 1);
    }
    if (events.length < 1000) break;
    if (offset > 100_000) throw new Error("Event export limit reached");
  }
  let issues = batches.some(b => !b.passed), completed = 0, scenarioCompleted = 0;
  const rows = PAYMENT_SCHEDULE.map(plan => {
    const item = matched.find(x => x.record.campaign?.intent === plan.planned_intent_id);
    const batch = item?.transfer?.txHash ? batchMap.get(item.transfer.txHash.toLowerCase()) : undefined;
    const verified = item?.record.state === "accepted" && item.transfer?.status === "completed" && batch?.passed === true;
    const scenarioPassed = item ? scenarioEvidence(plan.scenario, item.record, allEvents) : null;
    const rejected = allEvents.filter(e => e.type === "attempt_finished" && e.intent === plan.planned_intent_id && e.status === 402);
    const hadAttempt = (attemptCounts.get(plan.planned_intent_id) ?? 0) > 0;
    if (verified) completed++;
    if (verified && scenarioPassed) scenarioCompleted++;
    if (item && (item.transfer?.status === "failed" || ["unknown", "rejected"].includes(item.record.state))) issues = true;
    return { intent: plan.planned_intent_id, stage: plan.stage, scenario: plan.scenario, amount_atomic: plan.amount_atomic,
      amount_usdc: plan.amount_usdc, local_state: item?.record.state ?? (rejected.length ? "verification_rejected_before_reservation" : hadAttempt ? "unreserved_attempt_requires_review" : "not_run"), http_attempts: attemptCounts.get(plan.planned_intent_id) ?? 0,
      verification_rejections: rejected.length, verification_rejection_reasons: [...new Set(rejected.map(e => e.reason ?? "reason_not_recorded_by_previous_version"))],
      same_nonce_renewal_checks: allEvents.filter(e => e.type === "validity_renewal_prepared" && e.intent === plan.planned_intent_id).length,
      transfer_status: item?.transfer?.status ?? null, batch_hash: item?.transfer?.txHash ?? null,
      scenario_passed: scenarioPassed,
      concurrent_evidence: item && plan.scenario === "concurrent_same_authorization_replay" ? concurrentEvidence(item.record, allEvents) : null,
      supplemental_replay_attempts: allEvents.filter(e => e.type === "attempt_started" && e.intent === plan.planned_intent_id && e.attemptKind === "settled_receipt_replay").length,
      proof: verified ? "provider_attribution_and_chain_aggregate_verified" : item ? "pending_or_unverified" : hadAttempt ? "no_settlement_receipt_reserved" : "not_run",
      money_difference_atomic: verified ? "0" : null, response_sha256: item?.record.state === "accepted" ? item.record.response?.headers["x-radar-response-sha256"] ?? null : null };
  });
  const elapsed = Date.now() - state.startedAt;
  const spreadSessions = new Set(allEvents.filter(e => e.type === "attempt_started" &&
    PAYMENT_SCHEDULE.find(r => r.planned_intent_id === e.intent)?.scenario === "spread_sessions").map(e => e.sessionId).filter(Boolean)).size;
  const timing = timingEvidence(state, records.map(r => ({ ordinal: PAYMENT_SCHEDULE.find(p => p.planned_intent_id === r.campaign?.intent)!.ordinal, at: Date.parse(r.createdAt ?? "") })));
  if (!timing.schedule_respected) issues = true;
  const passed = completed === 1000 && scenarioCompleted === 1000 && spreadSessions >= 10 && !issues && timing.eligible_for_completion;
  if (!state.timingAmendment && passed) timing.original_24h_plan_followed = true;
  const maximumDifference = batches.flatMap(b => [b.buyer.difference, b.seller.difference]).map(x => { const n = BigInt(x); return n < 0n ? -n : n; }).reduce((a, b) => a > b ? a : b, 0n);
  const report = { ...emptyReport(), status: issues ? "failed_or_requires_review" : passed ? "passed" : "in_progress",
    scenario_verified_payments: scenarioCompleted, spread_sessions_observed: spreadSessions,
    scenario_evidence_note: "Server-observed exact-authorization attempts and results; response discard, boot and session labels are client-reported. Concurrent overlap requires matched server intervals and ledger event order, not an independent clock attestation. Supplemental settled_receipt_replay tests concurrent cached receipt retrieval after payment; it does not test an initial settlement race.",
    completed_payments: completed, attempted_payments: records.length, http_attempts: attempts,
    batch_transactions: batches.length, money_difference_atomic: maximumDifference > 0n ? maximumDifference.toString() : completed === records.length && records.length > 0 && !issues ? "0" : null,
    money_difference_measure: "maximum_absolute_wallet_difference_per_batch",
    overall_passed: passed ? true : issues ? false : null, generated_at: new Date().toISOString(),
    execution_timing: timing, elapsed_hours: elapsed / 3_600_000, event_count: eventCount, rows, batches,
    conclusion: passed ? (state.timingAmendment ? "1,000 owner-controlled payments reconciled under an explicitly amended accelerated schedule, with zero atomic-unit differences. This is not completion of the original 24-hour plan. Shared batches are not individual transaction proofs or customer revenue." : "1,000 owner-controlled payments reconciled under the original 24-hour plan with zero atomic-unit differences. Shared batch hashes are not individual transaction proofs or customer revenue.")
      : issues ? "An unresolved failure or discrepancy requires review; new payments remain halted."
      : "Partial results only. Pending payments and unverified batches are not counted as passes." };
  if (!await store.publish(state, report, scenarioCompleted, issues)) throw new Error("Campaign changed during reconciliation; run read-only reconciliation again");
  return { report, digest: createHash("sha256").update(JSON.stringify(report)).digest("hex") };
}

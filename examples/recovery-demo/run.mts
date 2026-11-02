/** Offline only: the real agentCall client and journal writer, a synthetic
 * signer/provider, and three separate OS processes. No wallet or network. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentCall, type AgentCallJournal } from "../../lib/agent-call";
import { getArcConfig } from "../../lib/arc";
import { encodeProtocolJson, responseDigest } from "../../lib/protocol";
import { readPrivateJson, writePrivateJson } from "../../lib/validation-local-files";

const payer = "0x2222222222222222222222222222222222222222" as const;
const seller = "0x1111111111111111111111111111111111111111";
const requestId = "11111111-1111-4111-8111-111111111111";
const endpoint = new URL("https://offline.example/api/signals/latest?symbol=ETH-USD");
const network = getArcConfig({ ARC_NETWORK: "testnet" });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const crashExitCode = 86;
type Phase = "crash" | "resume" | "cached";
interface Provider {
  quotes: number;
  signatures: number;
  paidAttempts: number;
  receipts: Record<string, { body: string; reference: string }>;
}

// Prevent an accidental fallback to the real fetch implementation.
globalThis.fetch = async () => { throw Error("Network disabled in offline recovery demo"); };

async function worker(phase: Phase, directory: string) {
  const journalPath = join(directory, "client.json");
  const providerPath = join(directory, "provider.json");
  const provider = (await readPrivateJson<Provider>(providerPath)) ?? {
    quotes: 0, signatures: 0, paidAttempts: 0, receipts: {},
  };
  const saveProvider = () => writePrivateJson(providerPath, provider);
  const result = await agentCall({
    endpoint, network, payer, seller, maximumAtomic: "1000", requestId,
    load: () => readPrivateJson<AgentCallJournal>(journalPath),
    save: (journal) => writePrivateJson(journalPath, journal),
    reserve(amountAtomic, id) {
      assert.equal(phase, "crash", "Restart must reuse the budget reservation");
      writeFileSync(join(directory, "reservation.json"), JSON.stringify({ amountAtomic, requestId: id }), { flag: "wx", mode: 0o600 });
    },
    signer: {
      address: payer,
      async signTypedData() {
        assert.equal(phase, "crash", "Restart must not create a new signature");
        provider.signatures++;
        await saveProvider();
        // Deliberately invalid signature. Never valid for a real payment.
        return `0x${"ab".repeat(65)}` as `0x${string}`;
      },
    },
    fetcher: async (url, init) => {
      assert.equal(String(url), endpoint.toString());
      assert.notEqual(phase, "cached", "A saved result should not call the provider");
      const headers = new Headers(init?.headers);
      const authorization = headers.get("payment-signature");
      if (!authorization) {
        assert.equal(phase, "crash", "Restart must reuse the original quote");
        provider.quotes++;
        await saveProvider();
        return new Response("{}", { status: 402, headers: {
          "payment-required": encodeProtocolJson({ x402Version: 2, resource: { url: endpoint.toString() }, accepts: [{
            scheme: "exact", network: network.network, asset: network.usdc, amount: "1000", payTo: seller,
            maxTimeoutSeconds: 604900, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: network.gatewayWallet },
          }] }),
        } });
      }
      const saved = await readPrivateJson<AgentCallJournal>(journalPath);
      assert.ok(saved?.paymentHeader === authorization, "Authorization must already be on disk");
      assert.equal(saved.state, "submitted");
      assert.equal(headers.get("x-radar-request-id"), requestId);
      const key = digest(authorization);
      provider.paidAttempts++;
      // This fixture explicitly implements idempotency by original authorization.
      // It does not claim every external x402 provider supports recovery.
      provider.receipts[key] ??= {
        body: JSON.stringify({ kind: "synthetic-only", signal_id: "offline-recovery-example", price: 1234.56 }),
        reference: `synthetic-receipt-${Object.keys(provider.receipts).length + 1}`,
      };
      await saveProvider();
      // Exit after provider acceptance, before a response or client catch/finally.
      if (phase === "crash") process.exit(crashExitCode);
      const receipt = provider.receipts[key];
      return new Response(receipt.body, { headers: {
        "x-radar-request-id": requestId,
        "x-radar-response-sha256": await responseDigest(receipt.body),
        "x-radar-payment-state": "gateway_accepted_not_onchain_verified",
        "payment-response": encodeProtocolJson({ success: true, network: network.network, payer, transaction: receipt.reference }),
      } });
    },
  });
  assert.equal(result.journal.state, "accepted");
  assert.equal(result.recovered, true, "An interrupted call must be classified as recovery");
  process.stdout.write(JSON.stringify({ phase, pid: process.pid, state: result.journal.state, recovered: result.recovered }));
}

async function demo() {
  const directory = await mkdtemp(join(tmpdir(), "radar-offline-recovery-"));
  try {
    const stages: { phase: Phase; pid: number; state: string }[] = [];
    for (const phase of ["crash", "resume", "cached"] as const) {
      const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--worker", phase, directory], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        // Do not inherit wallet credentials, NODE_OPTIONS, or load dotenv files.
        env: { PATH: process.env.PATH, TMPDIR: tmpdir(), NODE_ENV: "test" },
        encoding: "utf8", timeout: 15000, maxBuffer: 65536,
      });
      if (child.error) throw child.error;
      assert.equal(child.status, phase === "crash" ? crashExitCode : 0, child.stderr || "Unexpected worker exit");
      const journal = await readPrivateJson<AgentCallJournal>(join(directory, "client.json"));
      assert.ok(journal);
      if (phase === "crash") {
        assert.equal(journal.state, "submitted");
        assert.equal(journal.attempts.length, 0, "Abrupt exit must precede attempt completion");
        assert.ok(journal.paymentHeader);
      } else {
        const result = JSON.parse(child.stdout);
        assert.equal(result.recovered, true);
        assert.equal(result.pid, child.pid);
      }
      stages.push({ phase, pid: child.pid!, state: journal.state });
    }
    const provider = (await readPrivateJson<Provider>(join(directory, "provider.json")))!;
    const journal = (await readPrivateJson<AgentCallJournal>(join(directory, "client.json")))!;
    const reservation = JSON.parse(await readFile(join(directory, "reservation.json"), "utf8"));
    const receipts = Object.values(provider.receipts);
    assert.equal(new Set(stages.map(stage => stage.pid)).size, 3);
    assert.equal(provider.quotes, 1);
    assert.equal(provider.signatures, 1);
    assert.equal(provider.paidAttempts, 2);
    assert.equal(receipts.length, 1);
    assert.equal(reservation.amountAtomic, "1000");
    assert.equal(reservation.requestId, requestId);
    assert.equal(journal.responseHash, await responseDigest(receipts[0].body));
    assert.equal(journal.paymentReference, receipts[0].reference);
    assert.deepEqual(journal.response, JSON.parse(receipts[0].body));
    // Only safe summaries leave the ephemeral fixture directory.
    console.log(JSON.stringify({
      evidence: "OFFLINE_SYNTHETIC_ONLY", realPayments: 0, chainVerified: false,
      stages, quotes: provider.quotes, signatures: provider.signatures,
      paidRequestAttempts: provider.paidAttempts, simulatedCharges: receipts.length,
      reservedAtomic: reservation.amountAtomic, simulatedChargedAtomic: "1000",
      responseHashMatches: true, originalAuthorizationReused: true,
      note: "Real client + durable files; synthetic idempotent provider and signer. No chain, production HTTP, or cryptographic signature verification.",
    }, null, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--worker") {
  const phase = process.argv[3];
  assert.ok(phase === "crash" || phase === "resume" || phase === "cached");
  assert.ok(process.argv[4]);
  await worker(phase, process.argv[4]);
} else {
  assert.equal(process.argv.length, 2, "Use npm run demo:recovery (no credentials or endpoints)");
  await demo();
}

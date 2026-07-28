import { resolve } from "node:path";
import { createRequire } from "node:module";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { PriceSignal } from "../lib/signals";
import { buildDemoSignal, getLatestSignal } from "../lib/signals";
import { decide } from "../lib/decision";
import { DisciplineEngine } from "../lib/discipline";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const demoSignal = args.has("--demo-signal");
const resetBreaker = args.has("--reset-breaker");
const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

const discipline = new DisciplineEngine(
  resolve(root, "agent/state/discipline.json"),
  resolve(root, "agent/state/audit.jsonl"),
  {
    data: envNumber("DATA_DAILY_CAP_USDC", 0.1),
    treasury: envNumber("TREASURY_DAILY_CAP_USDC", 25),
  },
);

if (resetBreaker) {
  discipline.resetBreaker();
  console.log("Circuit breaker reset by human CLI.");
  process.exit(0);
}

async function buySignal(): Promise<{
  signal: PriceSignal;
  amountUsdc: number;
  transaction: string;
}> {
  if (dryRun) {
    const signal = demoSignal
      ? buildDemoSignal()
      : await getLatestSignal();
    return { signal, amountUsdc: 0, transaction: "dry-run" };
  }

  const privateKey = process.env.BUYER_PRIVATE_KEY as
    | `0x${string}`
    | undefined;
  if (!privateKey) {
    throw new Error(
      "BUYER_PRIVATE_KEY is required; use `npm run agent:dry` for a no-funds run",
    );
  }

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const endpoint = new URL("/api/signals/latest", baseUrl);
  if (demoSignal) endpoint.searchParams.set("demo", "sharp_drop");

  const gateway = new GatewayClient({
    chain: "arcTestnet",
    privateKey,
  });
  const support = await gateway.supports(endpoint.toString());
  if (!support.supported) {
    throw new Error("seller does not advertise Circle Gateway batching");
  }
  const advertisedAtomic = Number(support.requirements?.amount);
  if (!Number.isSafeInteger(advertisedAtomic) || advertisedAtomic <= 0) {
    throw new Error("seller advertised an invalid x402 amount");
  }
  const advertisedPrice = advertisedAtomic / 1_000_000;
  const maximumPrice = envNumber("SIGNAL_MAX_PRICE_USDC", 0.001);
  if (advertisedPrice > maximumPrice) {
    throw new Error(
      `seller asks ${advertisedPrice} USDC, above the ` +
        `${maximumPrice} USDC per-query maximum`,
    );
  }
  discipline.authorizeSpend("data", advertisedPrice);

  let balances = await gateway.getBalances();
  if (Number(balances.gateway.formattedAvailable) < advertisedPrice) {
    const depositAmount = envNumber("GATEWAY_AUTO_DEPOSIT_USDC", 0);
    if (depositAmount <= 0) {
      throw new Error(
        "Gateway balance is too low; deposit USDC or set GATEWAY_AUTO_DEPOSIT_USDC",
      );
    }
    if (Number(balances.wallet.formatted) < depositAmount) {
      throw new Error(
        `wallet has ${balances.wallet.formatted} USDC, below the ` +
          `${depositAmount} USDC auto-deposit`,
      );
    }
    const deposit = await gateway.deposit(depositAmount.toString());
    discipline.audit("gateway_deposit", {
      amount_usdc: deposit.formattedAmount,
      transaction: deposit.depositTxHash,
      wallet: gateway.address,
    });
    balances = await gateway.getBalances();
  }

  const result = await gateway.pay<PriceSignal>(endpoint.toString());
  const actualPrice = Number(result.formattedAmount);
  if (actualPrice !== advertisedPrice) {
    throw new Error(
      `settled ${actualPrice} USDC but seller advertised ${advertisedPrice} USDC`,
    );
  }
  discipline.recordSpend("data", actualPrice);
  return {
    signal: result.data,
    amountUsdc: actualPrice,
    transaction: result.transaction,
  };
}

interface TreasuryConfig {
  apiKey: string;
  entitySecret: string;
  sourceAddress: string;
  reserveAddress: string;
}

function getTreasuryConfig(): TreasuryConfig {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  const sourceAddress = process.env.CIRCLE_WALLET_ADDRESS;
  const reserveAddress = process.env.RESERVE_WALLET_ADDRESS;
  if (!apiKey || !entitySecret || !sourceAddress || !reserveAddress) {
    throw new Error(
      "Circle App Kit execution requires CIRCLE_API_KEY, " +
        "CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ADDRESS and RESERVE_WALLET_ADDRESS",
    );
  }
  return { apiKey, entitySecret, sourceAddress, reserveAddress };
}

async function executeTreasurySend(
  amountUsdc: number,
  config: TreasuryConfig,
) {
  const { AppKit } = await import("@circle-fin/app-kit");
  // tsx resolves the adapter's ESM build against the SDK's CJS entrypoint,
  // which drops the runtime Blockchain export. The adapter publishes a
  // compatible CommonJS entrypoint, so load that entrypoint explicitly.
  const { createCircleWalletsAdapter } = require(
    "@circle-fin/adapter-circle-wallets",
  ) as typeof import("@circle-fin/adapter-circle-wallets");
  const adapter = createCircleWalletsAdapter({
    apiKey: config.apiKey,
    entitySecret: config.entitySecret,
  });
  const kit = new AppKit({ disableErrorReporting: true });
  const params = {
    from: {
      adapter,
      chain: "Arc_Testnet" as const,
      address: config.sourceAddress,
    },
    to: config.reserveAddress,
    amount: amountUsdc.toFixed(6),
    token: "USDC" as const,
  };
  const estimate = await kit.estimateSend(params);
  const result = await kit.send(params);
  return { estimate, result };
}

async function main(): Promise<void> {
  discipline.preflight();
  discipline.audit("cycle_started", { dry_run: dryRun });

  const purchase = await buySignal();
  discipline.audit("signal_purchased", {
    signal_id: purchase.signal.signal_id,
    price_usdc: purchase.amountUsdc,
    payment_transaction: purchase.transaction,
    feed_status: purchase.signal.feed_status,
  });

  const decision = decide(purchase.signal);
  discipline.audit("decision_made", {
    signal_id: purchase.signal.signal_id,
    action: decision.action,
    reason: decision.reason,
  });
  console.dir({ purchase, decision }, { depth: null, colors: true });

  if (decision.action === "hold") {
    discipline.recordSuccess();
    return;
  }

  const transferUsdc = envNumber("TREASURY_REBALANCE_USDC", 1);
  const minimumRemainingUsdc = envNumber(
    "TREASURY_MIN_REMAINING_USDC",
    5,
  );
  if (!dryRun && process.env.TREASURY_AVAILABLE_USDC === undefined) {
    throw new Error(
      "TREASURY_AVAILABLE_USDC is required from the pre-cycle balance " +
        "reconciliation before a live treasury action",
    );
  }
  const configuredBalance = envNumber(
    "TREASURY_AVAILABLE_USDC",
    transferUsdc + minimumRemainingUsdc,
  );
  discipline.authorizeSpend("treasury", transferUsdc);
  discipline.assertTreasuryTransferSafe({
    sourceBalanceUsdc: configuredBalance,
    transferUsdc,
    minimumRemainingUsdc,
  });
  const treasuryConfig = dryRun ? undefined : getTreasuryConfig();

  const key = DisciplineEngine.actionKey(
    purchase.signal.ts.slice(0, 10),
    purchase.signal.signal_id,
    decision.action,
  );
  discipline.reserveAction(key);

  if (dryRun) {
    discipline.completeAction(key, "dry-run");
    discipline.audit("action_simulated", {
      key,
      amount_usdc: transferUsdc,
      destination: "reserve",
    });
    discipline.recordSuccess();
    console.log(`Dry-run: would move ${transferUsdc} USDC to reserve.`);
    return;
  }

  try {
    const execution = await executeTreasurySend(
      transferUsdc,
      treasuryConfig!,
    );
    const result = execution.result as {
      txHash?: string;
      explorerUrl?: string;
      state?: string;
    };
    const transaction = result.txHash ?? result.explorerUrl ?? "submitted";
    discipline.completeAction(key, transaction);
    discipline.recordSpend("treasury", transferUsdc);
    discipline.audit("action_executed", {
      key,
      amount_usdc: transferUsdc,
      transaction,
      result: execution.result,
    });
    discipline.recordSuccess();
    console.dir(execution, { depth: null, colors: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    discipline.markActionUncertain(key, message);
    throw error;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  discipline.audit("cycle_failed", { error: message });
  discipline.recordFailure(message);
  console.error(`Radar Agent failed safely: ${message}`);
  process.exitCode = 1;
}

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export class DisciplineError extends Error {}
export class CapExceeded extends DisciplineError {}
export class DuplicateAction extends DisciplineError {}
export class CircuitOpen extends DisciplineError {}
export class PositionUnsafe extends DisciplineError {}

type SpendCategory = "data" | "treasury";
type ActionStatus = "pending" | "succeeded" | "uncertain";

interface ActionRecord {
  status: ActionStatus;
  updatedAt: string;
  transaction?: string;
}

interface DisciplineState {
  day: string;
  spendMicrounits: Record<SpendCategory, number>;
  actions: Record<string, ActionRecord>;
  breaker: {
    consecutiveFailures: number;
    halted: boolean;
    reason?: string;
  };
}

interface AuditEntry {
  ts: string;
  event: string;
  [key: string]: unknown;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMicrounits(amountUsdc: number): number {
  if (!Number.isFinite(amountUsdc) || amountUsdc < 0) {
    throw new DisciplineError(`invalid USDC amount: ${amountUsdc}`);
  }
  return Math.round(amountUsdc * 1_000_000);
}

function newState(): DisciplineState {
  return {
    day: utcDay(),
    spendMicrounits: { data: 0, treasury: 0 },
    actions: {},
    breaker: { consecutiveFailures: 0, halted: false },
  };
}

export class DisciplineEngine {
  private state: DisciplineState;
  private readonly capsMicrounits: Record<SpendCategory, number>;

  constructor(
    private readonly statePath: string,
    private readonly auditPath: string,
    capsUsdc: Record<SpendCategory, number>,
    private readonly maxConsecutiveFailures = 3,
  ) {
    mkdirSync(dirname(statePath), { recursive: true });
    mkdirSync(dirname(auditPath), { recursive: true });
    this.capsMicrounits = {
      data: toMicrounits(capsUsdc.data),
      treasury: toMicrounits(capsUsdc.treasury),
    };
    this.state = this.load();
    this.rotateDay();
  }

  private load(): DisciplineState {
    try {
      return JSON.parse(readFileSync(this.statePath, "utf8")) as DisciplineState;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return newState();
      throw error;
    }
  }

  private rotateDay(): void {
    const today = utcDay();
    if (this.state.day !== today) {
      this.state.day = today;
      this.state.spendMicrounits = { data: 0, treasury: 0 };
      this.save();
    }
  }

  private save(): void {
    const temporaryPath = `${this.statePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2));
    renameSync(temporaryPath, this.statePath);
  }

  preflight(): void {
    this.rotateDay();
    if (this.state.breaker.halted) {
      throw new CircuitOpen(
        `agent halted: ${this.state.breaker.reason ?? "human reset required"}`,
      );
    }
  }

  authorizeSpend(category: SpendCategory, amountUsdc: number): void {
    const amount = toMicrounits(amountUsdc);
    const spent = this.state.spendMicrounits[category];
    const cap = this.capsMicrounits[category];
    if (spent + amount > cap) {
      throw new CapExceeded(
        `${category} spend ${(spent + amount) / 1_000_000} USDC ` +
          `would exceed the ${cap / 1_000_000} USDC daily cap`,
      );
    }
  }

  recordSpend(category: SpendCategory, amountUsdc: number): void {
    this.authorizeSpend(category, amountUsdc);
    this.state.spendMicrounits[category] += toMicrounits(amountUsdc);
    this.save();
  }

  static actionKey(
    day: string,
    signalId: string,
    action: string,
  ): string {
    return `${day}:${signalId}:${action}`;
  }

  reserveAction(key: string): void {
    const existing = this.state.actions[key];
    if (existing) {
      throw new DuplicateAction(
        `action ${key} already has status ${existing.status}; refusing replay`,
      );
    }
    this.state.actions[key] = {
      status: "pending",
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }

  completeAction(key: string, transaction: string): void {
    const action = this.state.actions[key];
    if (!action || action.status !== "pending") {
      throw new DisciplineError(`action ${key} is not pending`);
    }
    action.status = "succeeded";
    action.updatedAt = new Date().toISOString();
    action.transaction = transaction;
    this.save();
  }

  markActionUncertain(key: string, reason: string): void {
    const action = this.state.actions[key];
    if (action) {
      action.status = "uncertain";
      action.updatedAt = new Date().toISOString();
      action.transaction = reason;
      this.save();
    }
  }

  assertTreasuryTransferSafe(input: {
    sourceBalanceUsdc: number;
    transferUsdc: number;
    minimumRemainingUsdc: number;
  }): void {
    const { sourceBalanceUsdc, transferUsdc, minimumRemainingUsdc } = input;
    if (
      ![sourceBalanceUsdc, transferUsdc, minimumRemainingUsdc].every(
        Number.isFinite,
      ) ||
      transferUsdc <= 0 ||
      sourceBalanceUsdc - transferUsdc < minimumRemainingUsdc
    ) {
      throw new PositionUnsafe(
        `transfer would leave ${sourceBalanceUsdc - transferUsdc} USDC, ` +
          `below the ${minimumRemainingUsdc} USDC safety reserve`,
      );
    }
  }

  recordSuccess(): void {
    this.state.breaker.consecutiveFailures = 0;
    this.save();
  }

  recordFailure(reason: string): void {
    this.state.breaker.consecutiveFailures += 1;
    if (
      this.state.breaker.consecutiveFailures >= this.maxConsecutiveFailures
    ) {
      this.state.breaker.halted = true;
      this.state.breaker.reason =
        `${this.state.breaker.consecutiveFailures} consecutive failures; ` +
        `${reason} @ ${new Date().toISOString()}`;
    }
    this.save();
  }

  resetBreaker(): void {
    this.state.breaker = { consecutiveFailures: 0, halted: false };
    this.save();
    this.audit("breaker_reset", { actor: "human_cli" });
  }

  audit(event: string, fields: Record<string, unknown> = {}): void {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      event,
      ...fields,
    };
    appendFileSync(this.auditPath, `${JSON.stringify(entry)}\n`);
  }
}


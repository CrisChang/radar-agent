import {
  appendFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
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
export class UnresolvedSpend extends DisciplineError {}

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
  reservations: Record<string, {
    category: SpendCategory;
    amountMicrounits: number;
    status: "pending" | "unknown" | "settled";
    createdAt: string;
    transaction?: string;
  }>;
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
  const scaled = amountUsdc * 1_000_000;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.000001) {
    throw new DisciplineError("amount must fit exact USDC microunits");
  }
  return rounded;
}

function newState(): DisciplineState {
  return {
    day: utcDay(),
    spendMicrounits: { data: 0, treasury: 0 },
    actions: {},
    reservations: {},
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
      const state = JSON.parse(readFileSync(this.statePath, "utf8")) as DisciplineState;
      // Additive migration: never replace the legacy spend/action history.
      state.reservations ??= {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !state.actions || typeof state.actions !== "object" || Array.isArray(state.actions) ||
          !state.breaker || typeof state.breaker.halted !== "boolean" || !Number.isInteger(state.breaker.consecutiveFailures) || state.breaker.consecutiveFailures < 0 ||
          typeof state.reservations !== "object" || Array.isArray(state.reservations) ||
          !state.spendMicrounits || [state.spendMicrounits.data, state.spendMicrounits.treasury].some(n => !Number.isSafeInteger(n) || n < 0) ||
          Object.values(state.reservations).some(r => !["data", "treasury"].includes(r.category) ||
            !["pending", "unknown", "settled"].includes(r.status) || !Number.isSafeInteger(r.amountMicrounits) || r.amountMicrounits <= 0)) {
        throw new DisciplineError("Invalid ledger; reconciliation required, refusing reset");
      }
      return state;
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
    const fd = openSync(temporaryPath, "w", 0o600);
    try { writeFileSync(fd, JSON.stringify(this.state, null, 2)); fsyncSync(fd); }
    finally { closeSync(fd); }
    renameSync(temporaryPath, this.statePath);
    const directory = openSync(dirname(this.statePath), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }

  preflight(): void {
    this.rotateDay();
    if (this.state.breaker.halted) {
      throw new CircuitOpen(
        `agent halted: ${this.state.breaker.reason ?? "human reset required"}`,
      );
    }
    if (Object.values(this.state.reservations).some(r => r.status !== "settled")) {
      throw new UnresolvedSpend("pending or unknown spend requires reconciliation before another cycle");
    }
  }

  authorizeSpend(category: SpendCategory, amountUsdc: number): void {
    this.rotateDay();
    const amount = toMicrounits(amountUsdc);
    const held = Object.values(this.state.reservations)
      .filter(r => r.category === category && r.status !== "settled")
      .reduce((sum, r) => sum + r.amountMicrounits, 0);
    const spent = this.state.spendMicrounits[category] + held;
    const cap = this.capsMicrounits[category];
    if (spent + amount > cap) {
      throw new CapExceeded(
        `${category} spend ${(spent + amount) / 1_000_000} USDC ` +
          `would exceed the ${cap / 1_000_000} USDC daily cap`,
      );
    }
  }

  reserveSpend(key: string, category: SpendCategory, amountUsdc: number): void {
    if (this.state.reservations[key]) throw new DuplicateAction("spend reservation already exists");
    const amountMicrounits = toMicrounits(amountUsdc);
    if (amountMicrounits <= 0) throw new DisciplineError("reservation must be positive");
    this.authorizeSpend(category, amountUsdc);
    this.state.reservations[key] = { category, amountMicrounits, status: "pending", createdAt: new Date().toISOString() };
    this.save();
  }

  settleSpend(key: string, amountUsdc: number, transaction: string): void {
    const reservation = this.state.reservations[key];
    if (!reservation || reservation.status === "settled" || reservation.amountMicrounits !== toMicrounits(amountUsdc)) {
      throw new DisciplineError("settlement does not match an outstanding reservation");
    }
    this.rotateDay();
    this.state.spendMicrounits[reservation.category] += reservation.amountMicrounits;
    reservation.status = "settled";
    reservation.transaction = transaction;
    this.save();
  }

  markSpendUnknown(key: string): void {
    const reservation = this.state.reservations[key];
    if (reservation && reservation.status !== "settled") {
      reservation.status = "unknown";
      this.save();
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

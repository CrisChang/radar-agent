import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { after } from "node:test";
import { D1PaymentStore, type PaymentDatabase } from "../../lib/payment-store";

const databases: DatabaseSync[] = [];
after(() => { for (const db of databases) { try { db.close(); } catch { /* Already closed by restart test. */ } } });

/** Actual SQLite constraints/statements, D1-shaped async adapter. No cloud calls. */
export function paymentDatabase(path = ":memory:") {
  const sqlite = new DatabaseSync(path);
  databases.push(sqlite);
  sqlite.exec(readFileSync(new URL("../../migrations/0001_payment_receipts.sql", import.meta.url), "utf8"));
  const database: PaymentDatabase = {
    withSession() { return database; },
    prepare(sql: string) {
      return { bind(...values: SQLInputValue[]) {
        return {
          async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
          async first<T>() { return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null; },
        };
      } };
    },
  };
  return { store: new D1PaymentStore(database), sqlite, database };
}

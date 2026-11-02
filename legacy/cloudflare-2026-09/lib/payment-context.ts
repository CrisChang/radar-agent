import { AsyncLocalStorage } from "node:async_hooks";
import { D1PaymentStore, type PaymentDatabase, type PaymentStore } from "./payment-store";

const context = new AsyncLocalStorage<{ store?: PaymentStore; database?: PaymentDatabase }>();
export function withPaymentDatabase<T>(database: PaymentDatabase | undefined, run: () => T): T {
  return context.run({ database, store: database ? new D1PaymentStore(database) : undefined }, run);
}
export function currentPaymentStore(): PaymentStore | undefined { return context.getStore()?.store; }
export function currentPaymentDatabase(): PaymentDatabase | undefined { return context.getStore()?.database; }

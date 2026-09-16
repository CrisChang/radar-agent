import { AsyncLocalStorage } from "node:async_hooks";
import { D1PaymentStore, type PaymentDatabase, type PaymentStore } from "./payment-store";

const context = new AsyncLocalStorage<PaymentStore | undefined>();
export function withPaymentDatabase<T>(database: PaymentDatabase | undefined, run: () => T): T {
  return context.run(database ? new D1PaymentStore(database) : undefined, run);
}
export function currentPaymentStore(): PaymentStore | undefined { return context.getStore(); }

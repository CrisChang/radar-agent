/** Wallet clients commonly wrap the standard user-rejection code in causes.
 * Only an explicit rejection may release an unsigned local reservation. */
export function walletRejected(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; cause?: unknown };
    if (value.code === 4001) return true;
    current = value.cause;
  }
  return false;
}

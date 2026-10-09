# Payment recovery on Vercel

The October Vercel branch ports the main branch's payment state machine,
response replay, budget reservations and exclusive buyer lock. It replaces the
Cloudflare-specific runtime binding with an Upstash Redis REST adapter. D1 code
is retained as the source-compatible adapter and is covered with real SQLite
constraints; Vercel uses Redis, never the function filesystem.

## Durable state

The seller claims both a payment nonce and a logical request ID in one atomic
Redis Lua operation before settlement. It prepares valid live content before
accepting payment, records `settling`, then commits the exact successful
response before delivering it.

```text
preparing -> rejected
preparing -> settling -> accepted
                     -> unknown
```

An accepted or rejected request replays its saved response only when its full
fingerprint matches. A different nonce for the same logical request, or a reused
nonce with different terms/resource, is a conflict. A pending/unknown record
never triggers automatic settlement again. Database acknowledgement loss is
handled conservatively: a later read may recover an accepted response; an
uncertain record remains blocked for reconciliation.

Redis claims, request indexes and payer indexes have no TTL. Use a retained,
non-evicting database, keep backups appropriate to the pilot, and monitor the
provider quota. Do not use a temporary database that expires, a cache with
key eviction, function memory or `/tmp` as the paid ledger. A missing, failing or
malformed store fails closed before payment.

## Vercel configuration

Use the Vercel Marketplace Upstash for Redis integration, choose Free if
available, and connect only the intended project/environment. Integration
terms and any shared account information need the owner's confirmation.
Never switch to a paid plan or automatic upgrade without approval.

| Variable | Purpose |
| --- | --- |
| UPSTASH_REDIS_REST_URL | HTTPS database endpoint injected by integration |
| UPSTASH_REDIS_REST_TOKEN | Server-only write credential injected by integration |
| KV_REST_API_URL / KV_REST_API_TOKEN | Supported alternative integration names |
| RADAR_PAYMENT_NAMESPACE | Optional stable namespace; defaults to network and seller |
| RADAR_ACCEPT_PAYMENTS | Defaults to false; set true only for an approved ready pilot |

Keep credentials in server-only Vercel environment variables. They must never
use `NEXT_PUBLIC_`, appear in browser bundles, or be committed. Do not rename a
live namespace or change the database during an unresolved payment.

## Buyer protection

The CLI writes and fsyncs a budget reservation before requesting a signature.
Pending and unknown reservations survive a restart and UTC day changes. The
next cycle refuses to run while any remains unresolved. The process lock does
not expire automatically after a crash. Resetting the circuit breaker does not
release a payment reservation.

The browser pilot also reserves a one-query budget before signing, uses a
cross-tab Web Lock and keeps the reservation in local browser storage. It does
not persist a reusable payment authorization. Browser storage can be cleared
by its owner, so it is a demonstration control; server nonce/request claims
remain the durable payment protection.

## Reconciliation

1. Keep the original request ID and local reservation; do not sign a replacement.
2. Read `/api/billing?request_id=<UUID>` using the paying wallet's read signature.
3. If accepted, match wallet, network, amount and recipient to the local audit.
   The stored response can be replayed with the same original authorization.
4. If preparing, settling or unknown, reconcile against Gateway and independent
   chain evidence. Do not release the reservation merely because time passed or
   the query returned 404. Manual resolution is required; this MVP has no
   automatic refund or administrator ledger-edit endpoint.
5. A Gateway reference is not a confirmed transaction hash. Even a hash-shaped
   value remains unverified until independently checked.

The single-wallet pilot demonstrates functionality, not independent customers
or earned revenue. A separately approved Gateway deposit may provide confirmed
mainnet funding evidence; label it as funding and do not call it settlement of
the API fee.

## Validation

`npm test` runs the full suite, including a real local Redis process for
concurrency, process restart, settlement uncertainty and accepted-write
acknowledgement loss. These fixtures never sign or broadcast a real payment.
The Redis integration requires `redis-server` and `redis-cli`; override their
paths with `REDIS_SERVER_BIN` and `REDIS_CLI_BIN` outside this Mac.

Provider references: https://upstash.com/docs/redis/features/restapi,
https://upstash.com/docs/redis/features/durability,
https://vercel.com/docs/marketplace-storage.

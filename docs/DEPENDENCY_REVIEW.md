# Dependency review — October 9, 2026

The Vercel build reported audit findings in the existing lockfile. The deployed
framework is upgraded from Next.js 16.2.12 to 16.4.0. Compatible updates also
include sharp 0.35.5, axios 1.20.0, nanoid 3.3.20 and source-map-js 1.2.2.
The Circle x402 batching protocol remains pinned to 3.5.0.

Official npm audit after these changes reports **zero critical**, 11 high,
3 moderate and 10 low findings. This is not a clean-audit claim. The high
findings propagate from toml 3.0.0 through Anchor and the legacy Circle App Kit
and wallet adapters. npm reports no available fix for that installed parser
chain. Do not apply a blind forced upgrade or claim the dependency is fixed.

The hosted API and browser signer use the batching SDK, not the legacy treasury
executor. The App Kit imports are dynamic inside the local treasury executor;
mainnet treasury execution is disabled. The current Next.js server deployment
traces do not include App Kit, Anchor or toml. Keep arbitrary TOML inputs out of
the legacy executor. Revisit or remove that executor before enabling treasury
features; further provider upgrades need their own compatibility validation.

After the compatible updates, all 53 regression tests and the production build
pass. These checks use synthetic payment fixtures and do not prove a real
mainnet payment.

Primary references:
- https://github.com/advisories/GHSA-vcvr-r3jv-pc5j
- https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/advisories/GHSA-mcj8-r9mp-w47p
- https://github.com/advisories/GHSA-82x6-q7mm-w9cf
- https://github.com/advisories/GHSA-v5mp-jgw5-2x6j

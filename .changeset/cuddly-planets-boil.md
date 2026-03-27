---
'@ktarmyshov/svelte-adapter-azure-swa': minor
---

FEATURE: Added instrumentation support and Sentry integration tests.

BREAKING: Removed `options.cleanApiDir` and `options.cleanStaticDir`. Because server and client bundling now produce multiple JavaScript chunks with non-deterministic names, preserving old output files would leave orphaned chunks behind.

CI: Added coverage for `src/server/entry/entry.js` via `NODE_V8_COVERAGE`, since this file cannot be covered by unit tests alone.

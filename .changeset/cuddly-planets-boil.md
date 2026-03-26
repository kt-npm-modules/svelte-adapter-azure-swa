---
'@ktarmyshov/svelte-adapter-azure-swa': minor
---

Add instrumentation support and Sentry integration tests.

Breaking: Removed `options.cleanApiDir` and `options.cleanStaticDir`. Because server and client bundling produce multiple JavaScript chunks with non-deterministic names, preserving old output files would leave orphaned chunks behind.

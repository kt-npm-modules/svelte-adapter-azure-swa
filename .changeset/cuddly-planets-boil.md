---
'@ktarmyshov/svelte-adapter-azure-swa': minor
---

Add instrumentation support and Sentry integration tests.

Breaking: Removed `options.cleanApiDir` and `options.cleanStaticDir`. Server and client bundling produce multiple JavaScript chunks with non-deterministic names, so leaving old files in place would create orphaned chunks.

---
'@ktarmyshov/svelte-adapter-azure-swa': major
---

Simplify `sentryRewriteSourcesFactory` to accept the repository root as a single
string argument. Assign the returned callback to Sentry's `sourcemaps.rewriteSources`;
it uses native `context.mapDir` to produce repository-relative source paths without
scanning output directories or caching source locations. Replace the previous output
directory array and `prefixDir`/`log` options with the repository root. Requires a
Sentry build plugin providing `context.mapDir` (tested with Sentry SvelteKit 11.8.0).

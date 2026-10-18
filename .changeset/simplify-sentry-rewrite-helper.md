---
'@ktarmyshov/svelte-adapter-azure-swa': major
---

Migrate the adapter to **SvelteKit 3** for Azure Static Web Apps. Adapter 3.x
supports SvelteKit 3 only; applications remaining on SvelteKit 2 should stay on
the adapter 2.x line.

### Breaking changes

- Require `@sveltejs/kit@^3.1.0`, Node.js `>=22.17.0` and the
  `@azure/functions@^4.16.5` peer. The generated Azure SWA API configuration
  targets `node:22` and the Azure Functions v4 Node programming model.
- Configure the adapter in the SvelteKit 3 Vite plugin, for example
  `sveltekit({ adapter: adapter() })` in `vite.config.ts`, instead of
  `kit.adapter` in `svelte.config.js`.
- `serverRolldown` receives a deep clone of the server bundling configuration
  and **must explicitly return** a configuration object. Mutating without
  returning now fails the build. Adapter-owned entrypoints/aliases must be
  preserved, and the adapter controls the final output settings.
- `sentryRewriteSourcesFactory` now accepts a single repository-root path
  (absolute or cwd-relative). Use its returned callback with Sentry's
  `sourcemaps.rewriteSources`. It resolves source paths using Sentry's native
  `context.mapDir`, without output-directory scanning or caching. Replace the
  previous output-directory array and `prefixDir`/`log` options. A Sentry
  build plugin supplying `context.mapDir` is required (tested with Sentry
  SvelteKit 11.8.0).

### Build and deployment

- Use SvelteKit 3's generated server instance and instrumentation lifecycle
  in the Azure Functions HTTP renderer, with native Node.js Web APIs.
- Remove the adapter's secondary client rebundling pass. Copy SvelteKit's
  generated client/prerendered output and native client source maps; retain
  Rolldown server bundling with source maps.
- Update the independent demo and CI coverage for SvelteKit 3, including
  local SWA CLI and deployed Azure E2E tests and Sentry event ingestion.

For installation, prebuilt Azure deployment (including Function dependency
installation), custom API directory ownership, and the Sentry/PostgreSQL
workaround, see the updated README.

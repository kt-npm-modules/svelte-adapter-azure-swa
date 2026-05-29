## Why

The previous archived change [`2026-05-29-forwarded-headers-diagnostics`](../archive/2026-05-29-forwarded-headers-diagnostics/) landed a safe-by-design `/diagnostic-headers` probe so we can empirically observe how Azure Static Web Apps forwards `Authorization` and forwarded/host headers to the managed Function. The probe currently exercises **one** SWA routing path per method: `GET`/`HEAD`/`OPTIONS` arrive via `navigationFallback`, and `POST`/`PUT`/`PATCH`/`DELETE` arrive via the catch-all `*`-method rewrite at [src/swa-config/index.js:48-51](src/swa-config/index.js#L48-L51). Issue [#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218) asks a question the current matrix can't answer cleanly: **does SWA overwrite/inject `Authorization` only through `navigationFallback`, or also through an explicit per-path rewrite?**

To answer this without changing adapter behavior or the diagnostic implementation, we need a second SWA routing path that targets the same SvelteKit endpoint so the seven-method probe matrix can run against both paths and the captured fact JSON can be compared side by side. This change is a small follow-up diagnostic: it splits the existing probe into two URL paths, one reached via `navigationFallback` (the existing channel), and one reached via an explicit SWA route/rewrite (the new channel). The diagnostic helper, the route handler, the safety model, and the test structure are all reused unchanged.

## What Changes

- **Rename the existing diagnostic route**: move `tests/demo/src/routes/diagnostic-headers/+server.ts` to `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts`. The handler body is unchanged — it continues to call `diagnose(event)` and serialize per the existing per-method delivery rules (`HEAD` → `x-diag-*` headers; non-HEAD → JSON body). The renamed path continues to be reached through `navigationFallback` for `GET`/`HEAD`/`OPTIONS` (and through the `*`-method rewrite for `POST`/`PUT`/`PATCH`/`DELETE`, as today — see "Honest scope" in design.md).

- **Add an identical second route**: `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts` with the same handler body, importing the same `diagnose(event)` and `factsToDiagHeaders` helpers from [tests/demo/src/lib/diagnose.ts](tests/demo/src/lib/diagnose.ts). No new helper code; the route file delegates to the existing module.

- **Add an explicit SWA rewrite for the rewrite path through the existing adapter options**: update the demo's `svelte.config.js` to populate `azure({ customStaticWebAppConfig: { routes: [...] } })` — the existing adapter option already documented at [src/index.js](src/index.js) and consumed by [src/swa-config/index.js](src/swa-config/index.js) — adding one route entry that rewrites `/diagnostic-headers-rewrite` to the SSR function for every adapter-supported method. The adapter's existing `generateConfig` honors `customStaticWebAppConfig.routes` by prepending them to the auto-generated routes list, which means the explicit per-path rewrite takes precedence over the catch-all `*`-method rewrite and the `navigationFallback`. **No new adapter option is introduced; no `src/` file is edited.**

- **Update — not redesign — the existing Playwright test**: [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts) keeps its current structure (helpers, assertions, classification, attachments). The only changes are:
  - Replace the single `PROBE_PATH = '/diagnostic-headers'` constant with a per-mode lookup: `nav-fallback` → `/diagnostic-headers-nav-fallback`, `rewrite` → `/diagnostic-headers-rewrite`.
  - Run the same auth-probe matrix (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`) against **both** paths — fourteen auth probes total, two per method.
  - Run the existing no-auth baseline probe against **both** paths — two baseline probes total. The repeat-baseline and spoof-forwarded probes are no longer needed for the new comparison goal and are dropped to keep the matrix focused on the rewrite-vs-fallback question (see design.md "Pruned forwarded probes").
  - Prefix each attachment name and annotation with the route mode: `nav-fallback/get-auth.json`, `rewrite/get-auth.json`, etc.

- **Update the runbook section** in [tests/demo/AGENTS.md](tests/demo/AGENTS.md) to describe both paths, the per-mode attachment naming, and the comparison the captured JSONs answer (does Azure SWA overwrite/inject `Authorization` differently between `navigationFallback` and an explicit rewrite route?). The runbook continues to require pasting both local SWA CLI and real Azure SWA results into issue #218.

**Explicitly out of scope** for this change: any modification to `src/server/entry/entry.js`, `toRequest`, header normalization, or any decision about Authorization policy. No new adapter options are introduced. No raw header values, raw cookies, raw client principals, raw tokens, or full URLs are emitted by the diagnostic surface — the existing safety model is reused unchanged. No CI workflow modification: the Playwright report artifact uploaded by the previous change already covers the new attachments.

## Capabilities

### New Capabilities

<!-- None. The diagnostic capability already exists. -->

### Modified Capabilities

- `demo-diagnostics`: extend the existing diagnostic capability to expose the probe at **two** URL paths (`/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite`), reached respectively through `navigationFallback` and through an explicit SWA route added via the existing `customStaticWebAppConfig` option, so the auth-probe matrix can be run against both routing paths and the captured fact JSONs compared side by side. Tighten the Playwright probe matrix requirement to enumerate per-mode probes and per-mode attachment naming.

## Impact

- **Renamed files**: `tests/demo/src/routes/diagnostic-headers/+server.ts` → `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts` (handler body unchanged).
- **New files**: `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts` (identical handler body delegating to the existing helpers).
- **Modified files**:
  - `tests/demo/svelte.config.js` — gain a `customStaticWebAppConfig.routes` entry adding an explicit rewrite for `/diagnostic-headers-rewrite` to the SSR function across all adapter-supported methods.
  - `tests/demo/e2e/diagnostic-headers.test.ts` — per-mode `PROBE_PATH` lookup; auth-probe matrix runs against both modes; per-mode attachment naming and annotation; baseline-repeat and spoof-forwarded probes removed.
  - `tests/demo/AGENTS.md` — runbook section updated to describe both paths and the rewrite-vs-fallback comparison.
- **Unchanged**: `tests/demo/src/lib/diagnose.ts`, `tests/demo/src/lib/diagnose.spec.ts`, the `factsToDiagHeaders` helper, the `assertCoreShape` / `classifyAuthorization` helpers, the safety-by-design posture (no raw `Authorization`, no raw `x-test-authorization`, no raw cookies, no full header dumps; HEAD via `x-diag-*` headers; non-HEAD via sanitized JSON), `.github/workflows/ci-swa.yml`, all files under `src/`.
- **No new adapter options**. No changes to adapter request behavior. No changes to `toRequest`. No Authorization stripping/moving/normalization logic. **The diff under `src/` is empty.**
- **No new runtime dependencies**. The new route uses the existing `diagnose` helper; the explicit rewrite uses the existing `customStaticWebAppConfig` option; the test uses the existing Playwright `request` fixture.
- **CI**: no workflow change. The existing `playwright-report-azure-node<v>` artifact uploaded by the `azure` job in [.github/workflows/ci-swa.yml](.github/workflows/ci-swa.yml) already collects the report directory; the new per-mode attachments ride along.
- **Goal**: empirically determine, on a real Azure SWA deployment, whether the four observable Authorization outcomes (preserved / overwritten / stripped / custom-headers-not-reaching-app) differ between `navigationFallback` and an explicit per-path rewrite route. The follow-up adapter policy change (preserve / strip / rename / opt-in for `Authorization`) is informed by, but separate from, this evidence-gathering step.
- **Follow-up (separate change)**: adapter Authorization / forwarded-header policy, designed against the side-by-side fact captures this change produces.

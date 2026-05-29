## 1. Rename existing diagnostic route

- [ ] 1.1 Rename the directory `tests/demo/src/routes/diagnostic-headers/` → `tests/demo/src/routes/diagnostic-headers-nav-fallback/` so git records the rename and the existing `+server.ts` handler body carries over byte-for-byte. Use `git mv` to preserve history.
- [ ] 1.2 Confirm the renamed `+server.ts` still imports `diagnose` and `factsToDiagHeaders` from `$lib/diagnose` and exports `RequestHandler`s for `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — no edits to the handler body itself
- [ ] 1.3 Manually `curl http://localhost:5173/diagnostic-headers-nav-fallback` after `npm run dev --prefix tests/demo` and confirm the JSON body's `requestUrlPathname` is `/diagnostic-headers-nav-fallback`

## 2. Add second diagnostic route (rewrite mode)

- [ ] 2.1 Create `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts`. Body MUST be byte-for-byte identical to the renamed `nav-fallback` handler — same imports from `$lib/diagnose`, same `respondJson` / `respondHead` wrappers, same seven `RequestHandler` exports
- [ ] 2.2 Manually verify both routes locally: `curl -i http://localhost:5173/diagnostic-headers-nav-fallback` (JSON body, `requestUrlPathname` is `/diagnostic-headers-nav-fallback`); `curl -i http://localhost:5173/diagnostic-headers-rewrite` (JSON body, `requestUrlPathname` is `/diagnostic-headers-rewrite`); `curl -I http://localhost:5173/diagnostic-headers-rewrite` (empty body, `x-diag-*` set, `x-diag-request-url-pathname: /diagnostic-headers-rewrite`); `curl -i -X POST http://localhost:5173/diagnostic-headers-rewrite` (JSON body, no `x-diag-*` header)
- [ ] 2.3 Optional sanity (low-cost): grep diff the two route files (`diff tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts`) and confirm they are identical except for any path-derived comment text

## 3. Register the explicit SWA rewrite for the rewrite-mode path

- [ ] 3.1 Edit `tests/demo/svelte.config.js`. Inside the existing `customStaticWebAppConfig` literal at the call to `adapterSWA({ ... })`, add a `routes` array containing exactly one entry: `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }`. Omit any `methods` filter — every adapter-supported method must reach the explicit rewrite for this path
- [ ] 3.2 Confirm the existing `customStaticWebAppConfig.platform.apiRuntime` setting is preserved unchanged
- [ ] 3.3 Run `npm run build:swa --prefix tests/demo` (or whichever existing demo script runs `writeSWAConfig`) and inspect `tests/demo/build/staticwebapp.config.json`. Confirm: the generated `routes` array contains the new entry; the entry appears **before** the auto-generated catch-all `*`-method rewrite (so it takes precedence); no other routes were added or modified
- [ ] 3.4 Confirm `git diff src/` is empty (no adapter source changes) and `git diff` for the demo only touches `tests/demo/svelte.config.js` for this section

## 4. Update the Playwright probe matrix (do not redesign — minimal structural changes)

- [ ] 4.1 Open `tests/demo/e2e/diagnostic-headers.test.ts`. Replace the file-scope `const PROBE_PATH = '/diagnostic-headers'` with a `RouteMode = 'nav-fallback' | 'rewrite'` type alias and a `ROUTE_PATHS` lookup mapping each mode to its full URL path (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`). Define a `ROUTE_MODES: readonly RouteMode[]` array
- [ ] 4.2 Add a `routeMode: RouteMode` field to the `runAuthProbe` and `runForwardedProbe` option types. Inside each helper, derive the URL path from `ROUTE_PATHS[routeMode]` and pass it to `fetchWithMethod` (in place of the hard-coded `PROBE_PATH`)
- [ ] 4.3 Update the `attachFacts` call sites in both helpers to use `${routeMode}/${probeKey}.json` instead of `diagnostic-headers/${probeKey}.json`
- [ ] 4.4 Update the `testInfo.annotations.push(...)` call inside `runAuthProbe` so the `description` includes the route mode (e.g. `"nav-fallback GET get-auth: preserved"`)
- [ ] 4.5 Wrap each existing `test.describe('diagnostic-headers / auth probes', ...)` block (or its body) with a `for (const routeMode of ROUTE_MODES) { ... }` loop so the seven existing auth probes register twice — once per route mode. Pass `routeMode` to `runAuthProbe`. Per-mode test titles MUST be distinct (e.g. include the mode in the `test.describe` title or the per-test title) so Playwright doesn't collapse duplicates
- [ ] 4.6 Wrap the existing `get-baseline-no-auth` `test()` with the same `for (const routeMode of ROUTE_MODES)` loop, so two baselines register (one per mode). Pass `routeMode` to `runForwardedProbe`
- [ ] 4.7 Remove the `get-baseline-no-auth-repeat` and `get-spoof-forwarded` tests entirely (Decision 6 in design.md). Do not leave the helper code paths supporting them — the helpers carry over unchanged because they don't reference the dropped probes by name
- [ ] 4.8 Confirm the helper signatures (`controlHeaders`, `freshControls`, `getFacts`, `decodeFactValue`, `kebabToCamel`, `attachFacts`, `classifyAuthorization`, `assertCoreShape`, `resolveOrigin`, `fetchWithMethod`) are unchanged — only their callers thread `routeMode` through
- [ ] 4.9 The `assertCoreShape` string-search guard for `diagnosticBearer` and `probeId` remains unchanged and applies to every probe in both modes
- [ ] 4.10 Run `npm run test:swa --prefix tests/demo` locally. Confirm: 16 probes pass (14 auth + 2 baseline); `tests/demo/playwright-report` contains `nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json` attachments; `npx playwright show-report tests/demo/playwright-report` shows them grouped by mode in the UI; no attachment contains the per-test `diagnosticBearer` or `probeId` (string-search the attachment files)

## 5. Update the runbook

- [ ] 5.1 Open `tests/demo/AGENTS.md` (or `tests/demo/README.md` if more appropriate, mirroring the previous change's choice) and locate the existing "Forwarded-headers diagnostic probe" section
- [ ] 5.2 Update the section to name **both** URL paths (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`) and explain which SWA channel each one targets, including the "honest scope" caveat: the `nav-fallback` URL path uses `navigationFallback` for `GET`/`HEAD`/`OPTIONS` and the auto-generated catch-all `*`-method rewrite for `POST`/`PUT`/`PATCH`/`DELETE`, while the `rewrite` URL path uses an explicit per-path `rewrite` route for every method
- [ ] 5.3 Update the matrix description: 16 probes (14 per-mode auth probes + 2 per-mode no-auth baselines). Note that the previous version's `get-baseline-no-auth-repeat` and `get-spoof-forwarded` probes are removed and why
- [ ] 5.4 Document per-mode attachment naming: `nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json`. Show the cleanest comparison pairs to look at first (e.g. `(nav-fallback/get-auth, rewrite/get-auth)` for the navigationFallback-vs-explicit-rewrite axis on `GET`)
- [ ] 5.5 Confirm the local-vs-Azure distinction is preserved: local SWA CLI is supporting evidence; real Azure SWA deployment results govern issue #218; both per-mode sets must be pasted into the issue
- [ ] 5.6 Confirm the safety posture paragraph carries over unchanged: both routes are safe-by-design, no raw values ever emitted, the safety model is reused unchanged from the previous diagnostic change
- [ ] 5.7 Confirm the issue-#218 reminder is updated to require pasting both `nav-fallback/*.json` and `rewrite/*.json` sets
- [ ] 5.8 Confirm the runbook explicitly notes that **no CI workflow change** is required — the existing `playwright-report-azure-node<v>` artifact uploaded by the `azure` job in `.github/workflows/ci-swa.yml` already collects the new attachments

## 6. Verification

- [ ] 6.1 Run `git diff src/` and confirm the diff is empty
- [ ] 6.2 Run `git diff .github/` and confirm no workflow file is touched
- [ ] 6.3 Run `git diff tests/demo/svelte.config.js` and confirm the only change is the new `customStaticWebAppConfig.routes` entry for `/diagnostic-headers-rewrite`
- [ ] 6.4 Run `git status` and confirm the only files added are `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts` (new) and `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts` (renamed from `tests/demo/src/routes/diagnostic-headers/+server.ts`); the only files modified are `tests/demo/svelte.config.js`, `tests/demo/e2e/diagnostic-headers.test.ts`, and `tests/demo/AGENTS.md` (or `tests/demo/README.md`)
- [ ] 6.5 Confirm `tests/demo/src/lib/diagnose.ts` and `tests/demo/src/lib/diagnose.spec.ts` are unchanged (`git diff tests/demo/src/lib/`)
- [ ] 6.6 Run `npm run test:swa --prefix tests/demo` locally; confirm all 16 probes pass and produce per-mode attachments
- [ ] 6.7 Open the HTML report (`npx playwright show-report tests/demo/playwright-report`) and verify both groups (`nav-fallback/`, `rewrite/`) are present and each contains 8 attachments (7 auth + 1 baseline). String-search every attachment for the test's `diagnosticBearer` (32-byte base64url prefix) and `probeId` (UUID); none should be present
- [ ] 6.8 Run `npm run lint`
- [ ] 6.9 Run `npm run check`
- [ ] 6.10 Run `openspec validate diagnose-swa-rewrite-vs-fallback --strict` and resolve any reported issues
- [ ] 6.11 After pushing the PR, watch the `swa / azure (<node-version>)` job in the CI workflow; confirm the existing `playwright-report-azure-node<v>` artifact appears on the run summary page and contains both per-mode attachment groups captured against the deployed Azure SWA URL; download one attachment from each mode and confirm `requestUrlPathname` is the expected URL path

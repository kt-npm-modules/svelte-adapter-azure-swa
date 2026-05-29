## 1. Rename existing diagnostic route

- [x] 1.1 Rename the directory `tests/demo/src/routes/diagnostic-headers/` → `tests/demo/src/routes/diagnostic-headers-nav-fallback/` so git records the rename and the existing `+server.ts` handler body carries over byte-for-byte. Use `git mv` to preserve history.
- [x] 1.2 Confirm the renamed `+server.ts` still imports `diagnose` and `factsToDiagHeaders` from `$lib/diagnose` and exports `RequestHandler`s for `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — no edits to the handler body itself
- [x] 1.3 Manually `curl http://localhost:5173/diagnostic-headers-nav-fallback` after `npm run dev --prefix tests/demo` and confirm the JSON body's `requestUrlPathname` is `/diagnostic-headers-nav-fallback`

## 2. Add second diagnostic route (rewrite mode)

- [x] 2.1 Create `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts`. Body MUST be byte-for-byte identical to the renamed `nav-fallback` handler — same imports from `$lib/diagnose`, same `respondJson` / `respondHead` wrappers, same seven `RequestHandler` exports
- [x] 2.2 Manually verify both routes locally: `curl -i http://localhost:5173/diagnostic-headers-nav-fallback` (JSON body, `requestUrlPathname` is `/diagnostic-headers-nav-fallback`); `curl -i http://localhost:5173/diagnostic-headers-rewrite` (JSON body, `requestUrlPathname` is `/diagnostic-headers-rewrite`); `curl -I http://localhost:5173/diagnostic-headers-rewrite` (empty body, `x-diag-*` set, `x-diag-request-url-pathname: /diagnostic-headers-rewrite`); `curl -i -X POST http://localhost:5173/diagnostic-headers-rewrite` (JSON body, no `x-diag-*` header)
- [x] 2.3 Optional sanity (low-cost): grep diff the two route files (`diff tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts`) and confirm they are identical except for any path-derived comment text

## 3. Register the explicit SWA rewrite for the rewrite-mode path

- [x] 3.1 Edit `tests/demo/svelte.config.js`. Inside the existing `customStaticWebAppConfig` literal at the call to `adapterSWA({ ... })`, add a `routes` array containing exactly one entry: `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }`. Omit any `methods` filter — every adapter-supported method must reach the explicit rewrite for this path
- [x] 3.2 Confirm the existing `customStaticWebAppConfig.platform.apiRuntime` setting is preserved unchanged
- [x] 3.3 Run `npm run build:swa --prefix tests/demo` (or whichever existing demo script runs `writeSWAConfig`) and inspect `tests/demo/build/staticwebapp.config.json`. Confirm: the generated `routes` array contains the new entry; the entry appears **before** the auto-generated catch-all `*`-method rewrite (so it takes precedence); no other routes were added or modified
- [x] 3.4 Confirm `git diff src/` is empty (no adapter source changes) and `git diff` for the demo only touches `tests/demo/svelte.config.js` for this section

## 4. Update the Playwright probe matrix (parameterize by path — do not duplicate tests)

The pattern is: take the existing probe definitions, fetch helper, decode logic, assertions, outcome classification, and attachment creation as-is. Thread one new value — the request path — through them. Run the existing matrix once per route mode.

- [x] 4.1 Open `tests/demo/e2e/diagnostic-headers.test.ts`. Remove the file-scope `const PROBE_PATH = '/diagnostic-headers'`. Add a `ROUTE_MODES` literal and a `RouteMode` type alias at module scope: `const ROUTE_MODES = [{ key: 'nav-fallback', path: '/diagnostic-headers-nav-fallback' }, { key: 'rewrite', path: '/diagnostic-headers-rewrite' }] as const;` followed by `type RouteMode = (typeof ROUTE_MODES)[number];`
- [x] 4.2 Change `fetchWithMethod` to take the path as a parameter (drop the hard-coded `PROBE_PATH` reference). New signature: `(request, testInfo, path, method, headers, body)` with `path: string` inserted after `testInfo`. Body becomes `request.fetch(path, { method, headers: headersWithOrigin, data: body })`. Keep its TypeScript types in line with the existing signature — only `path: string` is new.
- [x] 4.3 Add a `routeMode: RouteMode` field to the `runAuthProbe` and `runForwardedProbe` option types. Inside each helper: pass `routeMode.path` to `fetchWithMethod`; replace the `attachFacts(testInfo, probeKey, facts)` call with one that prefixes the probe key by `${routeMode.key}/` — i.e. produce `nav-fallback/get-auth.json` and `rewrite/get-auth.json` rather than `diagnostic-headers/get-auth.json`. The signature of `attachFacts` itself does not need to change; it already takes the full probe key string. Inside `runAuthProbe`, change the `testInfo.annotations.push(...)` call so the `description` includes the route mode key (e.g. `"nav-fallback GET get-auth: preserved"`).
- [x] 4.4 Wrap each existing `test()` registration with a single `for (const routeMode of ROUTE_MODES) { ... }` loop. Each existing `test('get-auth — …', …)` becomes a template-literal title with `${routeMode.key}` prefixed (e.g. `${routeMode.key} get-auth — …`) and forwards `routeMode` into the corresponding `runAuthProbe`/`runForwardedProbe` call. Per-mode test titles MUST be distinct so Playwright doesn't collapse duplicates — embedding `routeMode.key` in the `test()` title is sufficient. The probe definitions, body strings, content types, and method choices stay byte-for-byte the same as today.
- [x] 4.5 Remove the `get-baseline-no-auth-repeat` and `get-spoof-forwarded` tests entirely (Decision 6 in design.md). Do not leave the helper code paths supporting them — the helpers carry over unchanged because they don't reference the dropped probes by name. After this step, the only forwarded probe in the file is `get-baseline-no-auth`, run once per route mode.
- [x] 4.6 Confirm the helper signatures (`controlHeaders`, `freshControls`, `getFacts`, `decodeFactValue`, `kebabToCamel`, `attachFacts`, `classifyAuthorization`, `assertCoreShape`, `resolveOrigin`) are unchanged. Only `fetchWithMethod` gains a `path` parameter; only `runAuthProbe` and `runForwardedProbe` gain a `routeMode` parameter and pass `routeMode.path` / `routeMode.key` through. No new helper is introduced; no probe definition is duplicated; no probe-key string is changed (only its prefix when attaching).
- [x] 4.7 The `assertCoreShape` string-search guard for `diagnosticBearer` and `probeId` remains unchanged and applies to every probe in both modes
- [x] 4.8 Run `npm run test:swa --prefix tests/demo` locally. Confirm: 16 probes pass (14 auth + 2 baseline); `tests/demo/playwright-report` contains `nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json` attachments; `npx playwright show-report tests/demo/playwright-report` shows them grouped by mode in the UI; no attachment contains the per-test `diagnosticBearer` or `probeId` (string-search the attachment files)

## 5. Update the runbook

- [x] 5.1 Open `tests/demo/AGENTS.md` (or `tests/demo/README.md` if more appropriate, mirroring the previous change's choice) and locate the existing "Forwarded-headers diagnostic probe" section
- [x] 5.2 Update the section to name **both** URL paths (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`) and explain which SWA channel each one targets, including the "honest scope" caveat: the `nav-fallback` URL path uses `navigationFallback` for `GET`/`HEAD`/`OPTIONS` and the auto-generated catch-all `*`-method rewrite for `POST`/`PUT`/`PATCH`/`DELETE`, while the `rewrite` URL path uses an explicit per-path `rewrite` route for every method
- [x] 5.3 Update the matrix description: 16 probes (14 per-mode auth probes + 2 per-mode no-auth baselines). Note that the previous version's `get-baseline-no-auth-repeat` and `get-spoof-forwarded` probes are removed and why
- [x] 5.4 Document per-mode attachment naming: `nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json`. Show the cleanest comparison pairs to look at first (e.g. `(nav-fallback/get-auth, rewrite/get-auth)` for the navigationFallback-vs-explicit-rewrite axis on `GET`)
- [x] 5.5 Confirm the local-vs-Azure distinction is preserved: local SWA CLI is supporting evidence; real Azure SWA deployment results govern issue #218; both per-mode sets must be pasted into the issue
- [x] 5.6 Confirm the safety posture paragraph carries over unchanged: both routes are safe-by-design, no raw values ever emitted, the safety model is reused unchanged from the previous diagnostic change
- [x] 5.7 Confirm the issue-#218 reminder is updated to require pasting both `nav-fallback/*.json` and `rewrite/*.json` sets
- [x] 5.8 Confirm the runbook explicitly notes that **no CI workflow change** is required — the existing `playwright-report-azure-node<v>` artifact uploaded by the `azure` job in `.github/workflows/ci-swa.yml` already collects the new attachments

## 6. Verification

- [x] 6.1 Run `git diff src/` and confirm the diff is empty
- [x] 6.2 Run `git diff .github/` and confirm no workflow file is touched
- [x] 6.3 Run `git diff tests/demo/svelte.config.js` and confirm the only change is the new `customStaticWebAppConfig.routes` entry for `/diagnostic-headers-rewrite`
- [x] 6.4 Run `git status` and confirm the only files added are `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts` (new) and `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts` (renamed from `tests/demo/src/routes/diagnostic-headers/+server.ts`); the only files modified are `tests/demo/svelte.config.js`, `tests/demo/e2e/diagnostic-headers.test.ts`, and `tests/demo/AGENTS.md` (or `tests/demo/README.md`)
- [x] 6.5 Confirm `tests/demo/src/lib/diagnose.ts` and `tests/demo/src/lib/diagnose.spec.ts` are unchanged (`git diff tests/demo/src/lib/`)
- [x] 6.6 Run `npm run test:swa --prefix tests/demo` locally; confirm all 16 probes pass and produce per-mode attachments
- [x] 6.7 Open the HTML report (`npx playwright show-report tests/demo/playwright-report`) and verify both groups (`nav-fallback/`, `rewrite/`) are present and each contains 8 attachments (7 auth + 1 baseline). String-search every attachment for the test's `diagnosticBearer` (32-byte base64url prefix) and `probeId` (UUID); none should be present
- [x] 6.8 Run `npm run lint`
- [x] 6.9 Run `npm run check`
- [x] 6.10 Run `openspec validate diagnose-swa-rewrite-vs-fallback --strict` and resolve any reported issues
- [ ] 6.11 After pushing the PR, watch the `swa / azure (<node-version>)` job in the CI workflow; confirm the existing `playwright-report-azure-node<v>` artifact appears on the run summary page and contains both per-mode attachment groups captured against the deployed Azure SWA URL; download one attachment from each mode and confirm `requestUrlPathname` is the expected URL path

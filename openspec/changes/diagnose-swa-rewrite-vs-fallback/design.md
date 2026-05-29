## Context

The previous change [`2026-05-29-forwarded-headers-diagnostics`](../archive/2026-05-29-forwarded-headers-diagnostics/) shipped a safe-by-design diagnostic probe at `/diagnostic-headers` together with a Playwright auth-probe matrix that hits the route once per HTTP method. The probe is currently routed by SWA in two ways depending on the HTTP method, both pointing at the same SvelteKit endpoint:

- `GET`/`HEAD`/`OPTIONS` arrive via the `navigationFallback.rewrite` to `/api/sk_render` (the catch-all SSR fallback emitted by [src/swa-config/index.js:59-61](src/swa-config/index.js#L59-L61)).
- `POST`/`PUT`/`PATCH`/`DELETE` arrive via the auto-generated catch-all rewrite `{ route: '*', methods: ['POST','PUT','DELETE','PATCH'], rewrite: '/api/sk_render' }` at [src/swa-config/index.js:48-51](src/swa-config/index.js#L48-L51).

Issue [#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218) asks whether SWA's apparent injection/overwrite of `Authorization` happens uniformly across both routing channels or only through one of them. The current matrix can't isolate that — every probe rides whichever channel SWA picks based on method, so a difference in behavior between channels would surface as method-dependent variance with no way to attribute it. To attribute cleanly, we need to **hit the same endpoint via two different SWA route configurations and compare**.

The constraint stated explicitly by the user: do not add new adapter options, do not change `toRequest`, do not change adapter request behavior, do not strip/move/normalize `Authorization`, and do not redesign the existing tests. Reuse the existing diagnostic implementation and safety model unchanged.

## Goals / Non-Goals

**Goals:**

- Expose the same `diagnose(event)` handler at two URL paths so the auth-probe matrix can be run against both SWA routing channels:
  - `/diagnostic-headers-nav-fallback` — reached, in the absence of any specific routes match, via the existing `navigationFallback` rewrite (today's behavior, just renamed).
  - `/diagnostic-headers-rewrite` — reached via an explicit per-path SWA `rewrite` route, added through the existing adapter option `customStaticWebAppConfig.routes`.
- Keep the existing diagnostic implementation, the safety-by-design posture, and the test structure exactly as they are; only the route paths, the explicit-rewrite SWA config entry, and the test's per-mode probe loop change.
- Produce per-mode attachments (`nav-fallback/<probe-key>.json`, `rewrite/<probe-key>.json`) so a maintainer reading the Playwright report sees both modes side by side.

**Non-Goals:**

- No new adapter options. No edits under `src/`. No edits to `src/server/entry/entry.js`, `toRequest`, or any header-normalization logic.
- No change to adapter request behavior. No stripping, moving, or normalizing of `Authorization`.
- No redesign of the test suite. Helper signatures (`controlHeaders`, `getFacts`, `attachFacts`, `assertCoreShape`, `classifyAuthorization`, `runAuthProbe`, `runForwardedProbe`) are reused unchanged.
- No change to `tests/demo/src/lib/diagnose.ts` or its unit tests. The fail-closed scheme rule, the constant-time compare, the `DiagnosticFacts` field set, and `factsToDiagHeaders` all carry over verbatim.
- No change to CI workflows. The Playwright report artifact already uploaded by the previous change collects the new attachments without modification.
- No decision about Authorization policy. This change is purely evidence-gathering for the follow-up.

## Decisions

### Decision 1: Two routes pointing at one handler module — not one handler with branching

The two URL paths each get their own SvelteKit `+server.ts` file, both delegating to the existing `diagnose` and `factsToDiagHeaders` helpers. Reason: SvelteKit routes the request based on the URL path; the handler files are tiny (the existing one is ~40 lines, see [tests/demo/src/routes/diagnostic-headers/+server.ts](tests/demo/src/routes/diagnostic-headers/+server.ts)). Duplicating the seven `RequestHandler` exports is one trivial wrapper file each; it keeps the route surface obvious and avoids any branching that could accidentally diverge per-mode.

The existing route file is **renamed** (not copied + deleted) to `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts` so git records the rename, the handler body is unchanged, and there is exactly one source of truth (the `diagnose` helper) for what facts the probe emits.

**Alternatives considered:** introduce a shared `+server.ts` that reads `event.url.pathname` and branches — rejected, no value; the helper already produces the same `DiagnosticFacts` regardless of pathname (`requestUrlPathname` is just a field). A single SvelteKit catch-all route — rejected, would either over-match or require a regex constraint, both more fragile than two explicit route directories.

### Decision 2: Explicit rewrite added through the existing `customStaticWebAppConfig.routes` option

The `azure-swa` adapter already accepts `customStaticWebAppConfig` (consumed at [src/swa-config/index.js:31-66](src/swa-config/index.js#L31-L66)). User-supplied `routes` are spread into the generated `routes` array **before** the auto-generated entries:

```js
routes: [
  ...customStaticWebAppConfig.routes,   // user's routes first
  { route: '/api/*' },
  { route: '/data-api/*' },
  { route: '*', methods: ['POST', ...], rewrite: '/api/sk_render' },
  { route: '/<appDir>/immutable/*', headers: { 'cache-control': '...' } }
]
```

SWA evaluates `routes` top-to-bottom and uses the first match. So adding a single entry like:

```js
{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }
```

…makes `/diagnostic-headers-rewrite` resolve via the explicit per-path rewrite for **every** HTTP method, taking precedence over the catch-all `*`-method rewrite (which would otherwise match `POST`/`PUT`/`PATCH`/`DELETE`) and over `navigationFallback` (which only fires when nothing in `routes` matches). This is exactly the second routing channel we need.

The route entry is added to `tests/demo/svelte.config.js` inside the existing `customStaticWebAppConfig` literal at [tests/demo/svelte.config.js:45-49](tests/demo/svelte.config.js#L45-L49). It is the single existing place where adapter options are configured for the demo.

**Why no `methods` filter on the new route:** the goal is "explicit rewrite for all seven adapter-supported methods on this URL path". Omitting `methods` makes SWA match every method on that path, which is what we want — the matrix tests `GET`/`HEAD`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` against this path.

**Alternatives considered:** add a route with `methods: ['POST','PUT','DELETE','PATCH']` only, mirroring the auto-generated catch-all — rejected, would leave `GET`/`HEAD`/`OPTIONS` on the rewrite path falling back to `navigationFallback`, defeating the comparison. Add a navigationFallback override — rejected, the adapter forbids that at [src/swa-config/index.js:18-20](src/swa-config/index.js#L18-L20). Add a new adapter option to expose a "diagnostic-rewrite" path — rejected, explicitly out of scope per user constraint.

### Decision 3: Two URL paths over one URL path with method-specific route entries

We split the diagnostic across two URL paths because the question we're answering is "does the route configuration in `staticwebapp.config.json` change SWA's `Authorization` handling?" Routing the same URL through two configurations would require the request to differ in some other way (a header, a cookie) so SWA could pick a config — but SWA routing is path-based. The cleanest way to encode "this request was routed via configuration A; this one via configuration B" is to make the URL path the discriminator, then put each path in its own route entry.

This also makes the captured fact JSONs unambiguous: `requestUrlPathname` in the facts will be `/diagnostic-headers-nav-fallback` vs `/diagnostic-headers-rewrite`, so a maintainer reading attachments out of context still knows which routing channel each one came from.

### Decision 4: Reuse the existing `diagnose` helper unchanged — including its current field set

`tests/demo/src/lib/diagnose.ts` and its unit test stay byte-for-byte identical. The handler files import `diagnose` and `factsToDiagHeaders` from `$lib/diagnose` exactly as the existing route does. The `DiagnosticFacts` field set (including `requestUrlPathname`) is unchanged, and the safety-by-design rules (no raw `Authorization`, no raw `x-test-authorization`, no raw cookies, no full URL with host/query, no full header dump, no substring of malformed Authorization-like values, fail-closed scheme regex, constant-time compare) carry over.

The `requestUrlPathname` field already exposes which URL path the request hit — no new field is needed to distinguish the two modes server-side.

**Alternatives considered:** add a `routeMode` field (`"nav-fallback" | "rewrite"`) computed server-side from the pathname — rejected, redundant with `requestUrlPathname`, and adding a field touches `diagnose.ts` and its unit test, which the user constraint asks us to leave alone.

### Decision 5: Parameterize the existing tests by path — do not duplicate them

The existing test file [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts) is updated by threading the request path through one helper and looping the existing probe registrations. The probe definitions, fetch helper, decode logic, assertions, outcome classification, and attachment creation are all reused as-is.

Concretely:

1. **Replace the global path constant with a route-mode list.** Drop `const PROBE_PATH = '/diagnostic-headers'`. Add:

   ```ts
   const ROUTE_MODES = [
     { key: 'nav-fallback', path: '/diagnostic-headers-nav-fallback' },
     { key: 'rewrite', path: '/diagnostic-headers-rewrite' }
   ] as const;
   type RouteMode = (typeof ROUTE_MODES)[number];
   ```

2. **`fetchWithMethod` takes the path as a parameter** instead of referencing `PROBE_PATH`:

   ```ts
   async function fetchWithMethod(request, testInfo, path, method, headers, body) {
     const headersWithOrigin = { Origin: resolveOrigin(testInfo), ...headers };
     return request.fetch(path, { method, headers: headersWithOrigin, data: body });
   }
   ```

   The signature gains exactly one parameter (`path: string`); the body shrinks by one line (the `PROBE_PATH` reference is replaced by the parameter).

3. **`runAuthProbe` and `runForwardedProbe` gain a `routeMode: RouteMode` option** and:
   - pass `routeMode.path` to `fetchWithMethod`
   - call `attachFacts(testInfo, \`${routeMode.key}/${probeKey}\`, facts)` so attachments land at `nav-fallback/get-auth.json`, `rewrite/get-auth.json`, etc. — `attachFacts`'s signature itself does not change; it already accepts the full probe-key string
   - inside `runAuthProbe`, the `testInfo.annotations.push({...})` `description` includes the mode key (e.g. `"nav-fallback GET get-auth: preserved"`)

4. **A single `for (const routeMode of ROUTE_MODES)` loop wraps the existing `test()` registrations** so each one runs once per mode. Each existing `test('get-auth — …', …)` becomes `test(\`${routeMode.key} get-auth — …\`, …)` and forwards `routeMode` to its helper. Per-mode titles must be distinct (the `routeMode.key` prefix in the test title is sufficient) so Playwright doesn't collapse duplicates. The probe definitions, body strings, content types, and method choices stay byte-for-byte the same as today.

5. **The `get-baseline-no-auth-repeat` and `get-spoof-forwarded` tests are removed entirely** — see "Pruned forwarded probes" below.

Helper signatures (`controlHeaders`, `freshControls`, `getFacts`, `decodeFactValue`, `kebabToCamel`, `attachFacts`, `classifyAuthorization`, `assertCoreShape`, `resolveOrigin`) are unchanged. Only `fetchWithMethod` gains a `path` parameter; only `runAuthProbe`/`runForwardedProbe` gain a `routeMode` parameter. No probe definition is duplicated; no probe-key string is renamed (only its attachment prefix). The four assertions inside `assertCoreShape` and the safety string-search guard are unchanged.

**Alternatives considered:** redesign the test as two separate test files, one per mode — rejected, duplicates the probe definitions and the helper wiring, the user constraint asks us not to redesign the tests. Parameterize via Playwright projects — rejected, would require editing `playwright.config.ts` and changes how the local `npm run test:swa` runs work; out of scope. Branch on `routeMode` inside the helpers without looping — rejected, would only run one mode per test invocation.

### Decision 6: Pruned forwarded probes — keep baseline, drop repeat and spoof

The previous matrix included three additional `GET` probes: `get-baseline-no-auth`, `get-baseline-no-auth-repeat`, `get-spoof-forwarded`. For the rewrite-vs-fallback comparison we keep only `get-baseline-no-auth` and run it once per mode.

- **`get-baseline-no-auth` retained, both modes:** the no-auth baseline tells us, per mode, whether SWA is injecting an `Authorization` even when the client didn't send one. Without it, "stripped" and "preserved" can't be distinguished cleanly per mode.
- **`get-baseline-no-auth-repeat` removed:** its purpose was inject-stability across two requests on the same channel. Now that we have two channels, channel-mode variance is the more useful signal; we don't need a second sample on the same channel to answer the rewrite-vs-fallback question.
- **`get-spoof-forwarded` removed:** the spoofing surface question is orthogonal to rewrite-vs-fallback and was already answered by the previous change's evidence gathering. Carrying it on every probe matrix going forward inflates the report without addressing the new comparison.

The user instruction was to "keep the existing no-auth baseline probe per path", which matches: one baseline per route mode.

**Alternatives considered:** keep all three forwarded probes per mode (six probes) — rejected, doubles report noise without serving the new goal.

### Decision 7: Per-mode attachment naming maps to a per-mode subfolder in the report

`testInfo.attach` accepts a path-shaped name; Playwright treats it as a logical attachment label, not a filesystem path, so embedding a `/` produces a clean grouping in the HTML report. The existing code uses `diagnostic-headers/<probe-key>.json`. The new naming uses `<route-mode>/<probe-key>.json`:

- `nav-fallback/get-auth.json`, `nav-fallback/head-auth.json`, …, `nav-fallback/get-baseline-no-auth.json`
- `rewrite/get-auth.json`, …, `rewrite/get-baseline-no-auth.json`

This is exactly the grouping a reader needs to do "open the report, eyeball the two columns side by side". A maintainer pasting findings into issue #218 can grab the eight `nav-fallback/*.json` and the eight `rewrite/*.json` together.

**Alternatives considered:** flat names like `nav-fallback-get-auth.json` — rejected, loses the side-by-side grouping in Playwright's HTML report. Keep `diagnostic-headers/` prefix and append the mode — rejected, makes the naming inconsistent with the URL paths.

### Decision 8: No CI workflow change

The previous change already added an `actions/upload-artifact@v7` step to the `azure` job in [.github/workflows/ci-swa.yml](.github/workflows/ci-swa.yml) that uploads `tests/demo/playwright-report` under a node-version-distinguished name. The new per-mode attachments live inside that report directory; nothing about the upload step needs to change.

**Alternatives considered:** add a separate per-mode artifact — rejected, the report is already grouped per-mode by Decision 7; a separate artifact is unnecessary and would duplicate data.

## Honest scope

A note for readers: in today's adapter config, requests for `/diagnostic-headers` from `POST`/`PUT`/`PATCH`/`DELETE` already hit the catch-all `*`-method rewrite at [src/swa-config/index.js:48-51](src/swa-config/index.js#L48-L51), which is itself a `rewrite`-type route. So strictly, the existing path is _not_ purely a `navigationFallback` channel — it's `navigationFallback` for the three method-restricted GET-family entries and the catch-all method-restricted `*` rewrite for the other four.

The new `/diagnostic-headers-rewrite` URL is reached, for **every** method, through an explicit `rewrite` route entry — including `GET`/`HEAD`/`OPTIONS`, which do not currently traverse any explicit rewrite for the existing path. The most useful comparison the captured data can support is therefore between:

- `nav-fallback/get-auth.json` vs `rewrite/get-auth.json` (and `head-auth`, `options-auth`) — pure `navigationFallback` vs explicit `rewrite` route, all three on `GET`-family methods that SWA would have routed via fallback otherwise.
- `nav-fallback/post-auth-form.json` vs `rewrite/post-auth-form.json` (and `put`, `patch`, `delete`) — catch-all `*`-method rewrite vs a per-path explicit rewrite. The `Authorization` handling difference (if any) between two `rewrite`-type configurations would surface here.

This is what the runbook section calls out so issue #218 readers don't over-interpret the comparison.

## Risks / Trade-offs

- **[Risk]** Two routes accidentally diverge over time (someone adds logging to one and not the other). → **Mitigation:** both routes are tiny wrappers calling the same `diagnose` helper. The handler bodies are byte-for-byte identical except for the path the file lives at — a future maintainer copy-pasting a change to one without the other would be obvious in code review. Optional: a unit test asserts the two route files have identical handler exports.
- **[Risk]** SWA's route ordering rules differ from documented behavior in some edge case, and the explicit rewrite doesn't actually fire (the request still resolves via `navigationFallback`). → **Mitigation:** the captured `requestUrlPathname` in each fact JSON makes it obvious which path actually arrived; if both modes report the same pathname or both arrive at unexpected paths the symptom is visible in the attachment.
- **[Risk]** Adding a new `customStaticWebAppConfig.routes` entry conflicts with the demo's existing route entries (today there are none — `customStaticWebAppConfig` only sets `platform`). → **Mitigation:** the entry only matches `/diagnostic-headers-rewrite`, which doesn't exist anywhere else in the demo's URL space; no conflict possible.
- **[Risk]** Doubling the auth-probe count from seven to fourteen meaningfully extends test runtime against a real Azure deployment. → **Mitigation:** each probe is a single HTTP request with no body or a 13-byte body; total added wall-clock should be well under one minute. If it becomes a problem, the matrix can be split across Playwright projects later.
- **[Trade-off]** The existing `diagnose-spec.ts` unit test only covers the helper and `factsToDiagHeaders`. The two-route-pointing-at-one-handler invariant isn't enforced by a test. → Accepted: review-level discipline is enough; a structural test that both files exist and export the same seven handlers is optional and low-value.

## Migration Plan

Not applicable — this change adds one route file, renames one route file, edits one demo config and one test file, and updates one runbook section. Rollback is `git revert`. No data migration. No CI flag flip. The previous change's CI artifact upload continues to work; the new attachments simply appear in the same report.

Sequencing:

1. Implement the change on a feature branch.
2. Run `npm run test:swa --prefix tests/demo` locally and confirm: both URL paths return 200 across all seven methods; per-mode attachments are present in `tests/demo/playwright-report`; no `diagnosticBearer` or `probeId` appears in any attachment.
3. Push the branch and open a PR. CI's `swa / azure (<node-version>)` job runs against the deployed Azure SWA preview URL.
4. Download the `playwright-report-azure-node<v>` artifact; open the report; compare the `nav-fallback/<probe>.json` and `rewrite/<probe>.json` attachments per method.
5. Paste both sets into issue #218 with a short note ("Authorization handling per channel: nav-fallback vs explicit rewrite").
6. Open the follow-up adapter Authorization / forwarded-header policy change.

## Open Questions

- Should the explicit-rewrite route entry pin a `methods` array, or omit it (matching every method on the path)? **Decision:** omit `methods` — every adapter-supported method should reach the route via the explicit rewrite for the comparison to cover all seven methods. This is what Decision 2 already states; documented here to head off review drift.

- Is the `routeMode` discriminator in the test helper an enum string, a project tag, or a Playwright `test.describe.parallel.each` parameter? **Decision:** a plain `RouteMode = 'nav-fallback' | 'rewrite'` type alias used by a top-level `for` loop wrapping the existing `test.describe` blocks (or two `test.describe` blocks parameterized by a helper). The user instruction is to update the existing tests, not redesign them; a `for` loop around the existing `test()` registrations is the smallest possible structural change.

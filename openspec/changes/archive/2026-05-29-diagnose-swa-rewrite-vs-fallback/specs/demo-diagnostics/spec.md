## MODIFIED Requirements

### Requirement: Demo diagnostic route exposes only sanitized facts

The demo app SHALL expose the safe-by-design diagnostic probe at **two** SvelteKit `+server.ts` routes — `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite` — that both handle every HTTP method registered by the adapter (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`) and both delegate to the same shared `diagnose(event)` helper exported from `tests/demo/src/lib/diagnose.ts`. No method on either path MAY return 405. The handler bodies of the two route files MUST be byte-for-byte identical except for their location on disk; both files MUST import and call the same `diagnose` and `factsToDiagHeaders` helpers, and neither file MAY introduce its own logic for header inspection, response shaping, or error handling.

The helper MUST compute a `DiagnosticFacts` object server-side and emit only that object; it MUST NOT return raw request header values, raw cookies, raw client principals, raw tokens, full URLs (with host or query), or arbitrary unknown header values in any form (response body, response headers, log output reachable by callers, or any side channel). The same `DiagnosticFacts` contract — the field set, the fail-closed scheme rule, the constant-time comparator, and the per-method delivery channel (`HEAD` → `x-diag-*` headers, every other method → JSON body) — applies identically on both paths. The `DiagnosticFacts` field set is unchanged from the previous version of this requirement and consists of:

- `method`: the HTTP method as observed by the handler (string)
- `requestUrlProtocol`: the URL protocol (e.g. `"https:"`, `"http:"`) — non-secret
- `requestUrlHostKind`: one of `"public" | "internal-azure-functions" | "localhost" | "unknown"` — closed enum, host value itself NOT returned
- `requestUrlPathname`: the URL path (e.g. `"/diagnostic-headers-nav-fallback"`, `"/diagnostic-headers-rewrite"`) — query string and fragment MUST NOT be returned
- `authorizationPresent`: boolean
- `testAuthorizationPresent`: boolean
- `authorizationScheme`: scheme token (lowercased) or `null`, computed by the strict fail-closed rule
- `testAuthorizationScheme`: scheme token (lowercased) or `null`, computed by the same fail-closed rule
- `authorizationLooksBearer`: boolean
- `testAuthorizationLooksBearer`: boolean
- `authorizationEqualsTestAuthorization`: boolean or `null` (`null` if either header absent)
- `testProbeIdPresent`: boolean
- `testProbeIdMatchesExpected`: boolean or `null` (`null` if `x-test-probe-id` or `x-test-expected-probe-id` is absent)
- `hostPresent`: boolean
- `hostLooksInternalAzureFunctionsHost`: boolean
- `xMsOriginalUrlPresent`: boolean
- `xMsOriginalUrlLooksAbsolute`: boolean
- `xMsOriginalUrlHostEqualsUrlHost`: boolean or `null` (`null` if either side fails to parse)
- `xForwardedHostPresent`: boolean
- `xForwardedProtoPresent`: boolean
- `xForwardedForPresent`: boolean
- `xMsClientPrincipalPresent`: boolean
- `timestamp`: ISO-8601 UTC timestamp captured at request time
- `requestId`: server-generated identifier (e.g. `crypto.randomUUID()`)

The single-path `/diagnostic-headers` URL is no longer exposed; it is replaced by the two route-mode paths above.

#### Scenario: Both routes respond 200 across every method and echo their method

- **WHEN** a client issues a request with method `M` against either `/diagnostic-headers-nav-fallback` or `/diagnostic-headers-rewrite`, where `M` is any of `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- **THEN** the route SHALL respond with HTTP 200 and the emitted `DiagnosticFacts` object's `method` field SHALL equal `M`

#### Scenario: Each route reports its own pathname

- **WHEN** a client issues a request to `/diagnostic-headers-nav-fallback`
- **THEN** the emitted `DiagnosticFacts` object's `requestUrlPathname` field SHALL equal `"/diagnostic-headers-nav-fallback"`
- **AND WHEN** a client issues a request to `/diagnostic-headers-rewrite`
- **THEN** the emitted `DiagnosticFacts` object's `requestUrlPathname` field SHALL equal `"/diagnostic-headers-rewrite"`

#### Scenario: Both paths expose the same DiagnosticFacts contract

- **WHEN** identical requests (same method, same headers, same body) are issued against `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite`
- **THEN** both responses SHALL carry the same set of `DiagnosticFacts` fields with the same types and the same closed-enum / boolean / scheme-token semantics, differing only in the per-request fields (`method` if the methods differ, `requestUrlPathname`, `timestamp`, `requestId`) and in any field whose value is determined by the routing channel (e.g. `hostPresent` / `xMsOriginalUrl*` / `xForwarded*` may differ if SWA presents them differently per channel — those differences are the diagnostic signal we are capturing)

#### Scenario: HEAD on either route delivers facts via x-diag-\* response headers

- **WHEN** a client issues `HEAD /diagnostic-headers-nav-fallback` or `HEAD /diagnostic-headers-rewrite`
- **THEN** the response SHALL have HTTP status 200, an empty body (RFC 9110 §9.3.2), and one `x-diag-<kebab-case-key>` response header per fact field — boolean values encoded as `"true"`/`"false"`/`"null"`, enum/scheme values as short strings — with no `x-diag-*` header carrying a raw header value or full URL

#### Scenario: Non-HEAD methods on either route deliver facts via JSON body

- **WHEN** a client issues a request with method `M ∈ {GET, POST, PUT, PATCH, DELETE, OPTIONS}` against either route
- **THEN** the response SHALL have HTTP status 200, `Content-Type: application/json`, and a JSON body parseable as the `DiagnosticFacts` object
- **AND** the response SHALL NOT include any `x-diag-*` header

#### Scenario: No raw sensitive values are emitted on either route

- **WHEN** a request arrives at either route carrying any value in `Authorization`, `x-test-authorization`, `Cookie`, `x-ms-client-principal`, or any other sensitive header
- **THEN** the response (body and headers, both channels) SHALL NOT contain any substring of the raw header value, beyond the lowercased scheme token (computed by the strict fail-closed rule) for `Authorization` and `x-test-authorization`
- **AND** the response SHALL NOT contain any full URL with host or query string

#### Scenario: Raw request.headers dump is forbidden on either route

- **WHEN** the routes are implemented
- **THEN** neither route's response (body or headers) SHALL contain a `request.headers` field, an arbitrary header map, or any other structure that exposes raw values of unknown headers; the only header-derived data emitted SHALL be the sanitized boolean / scheme-token / classification fields enumerated in this requirement

#### Scenario: URL host is never echoed verbatim from either route

- **WHEN** the diagnostic-fact object is built on either route
- **THEN** the URL host SHALL be classified into the `requestUrlHostKind` closed enum and the raw host value SHALL NOT appear in the response

#### Scenario: Two route files share the same handler logic

- **WHEN** both `tests/demo/src/routes/diagnostic-headers-nav-fallback/+server.ts` and `tests/demo/src/routes/diagnostic-headers-rewrite/+server.ts` exist
- **THEN** both files SHALL import `diagnose` and `factsToDiagHeaders` from `$lib/diagnose` and SHALL export `RequestHandler`s for `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` whose bodies are byte-for-byte identical between the two files

### Requirement: Playwright probe matrix exercises the route safely

A Playwright e2e test file at `tests/demo/e2e/diagnostic-headers.test.ts` SHALL drive both routes via Playwright's `request` fixture (`APIRequestContext`) — not browser navigation — and run a fixed **16-probe** matrix consisting of seven Authorization probes per route mode (fourteen auth probes total — one per adapter-supported HTTP method, per mode, tested directly) plus one no-auth baseline `GET` probe per route mode (two baselines total). Each probe MUST:

- Generate a unique-per-test `diagnosticBearer` (random base64url, e.g. 32 bytes from `crypto.randomBytes`) and `probeId` (random UUID).
- Send `Authorization: Bearer <diagnosticBearer>` on every probe testing the Authorization channel for its method (the fourteen per-mode auth probes); send `x-test-authorization: Bearer <diagnosticBearer>` on every probe; send `x-test-probe-id: <probeId>` and `x-test-expected-probe-id: <probeId>` on every probe.
- Target the URL path appropriate to its route mode: `/diagnostic-headers-nav-fallback` for the `nav-fallback` mode, `/diagnostic-headers-rewrite` for the `rewrite` mode.
- Retrieve the `DiagnosticFacts` object via the channel appropriate to the probe's method (JSON body for non-HEAD; `x-diag-*` response headers for HEAD).
- Attach **only the sanitized `DiagnosticFacts` object** to the Playwright report via `testInfo.attach('<route-mode>/<probe-key>.json', { body: <stringified JSON>, contentType: 'application/json' })` — i.e. attachment names MUST be prefixed with the route mode (`nav-fallback/get-auth.json`, `rewrite/get-auth.json`, …, `nav-fallback/get-baseline-no-auth.json`, `rewrite/get-baseline-no-auth.json`). The previous single-path naming `diagnostic-headers/<probe-key>.json` MUST NOT be used. The test MUST NOT log, attach, or otherwise persist `diagnosticBearer`, `probeId`, raw request headers, or raw response headers.
- Assert HTTP status equals 200; the fact object decodes successfully with the expected field shape; `facts.method` equals the requested method; the comparator booleans `authorizationPresent`, `testAuthorizationPresent`, `authorizationEqualsTestAuthorization`, and `testProbeIdPresent` are present in the decoded facts; the serialized fact attachment contains neither `diagnosticBearer` nor `probeId` (string-search guard). Assert nothing about the _values_ of the comparator booleans (`authorizationEqualsTestAuthorization`, `xMsOriginalUrlHostEqualsUrlHost`, etc.) — those are findings, not regressions.
- For probes that send `Authorization`, classify the observed outcome into one of `preserved | overwritten | stripped | custom-headers-not-reaching-app` per the comparator rule, and report the classification together with the route mode and HTTP method via `testInfo.annotations` (or test name) so a maintainer can read it from the Playwright report without parsing JSON.

The probe matrix is exactly **sixteen probes** — fourteen per-mode auth probes and two per-mode no-auth baselines:

**Per-route-mode auth probes (each tested directly; `PATCH` and `DELETE` are NOT sampled by proxy from `POST`/`PUT`):**

For each `routeMode ∈ {'nav-fallback', 'rewrite'}`:

1. `get-auth` — `GET`, `Authorization` + controls
2. `head-auth` — `HEAD`, `Authorization` + controls
3. `post-auth-form` — `POST`, `Authorization` + controls + `Content-Type: application/x-www-form-urlencoded`, body `foo=bar`
4. `put-auth-json` — `PUT`, `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`
5. `patch-auth-json` — `PATCH`, `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`
6. `delete-auth` — `DELETE`, `Authorization` + controls
7. `options-auth` — `OPTIONS`, `Authorization` + controls

**Per-route-mode no-auth baseline:**

For each `routeMode ∈ {'nav-fallback', 'rewrite'}`:

8. `get-baseline-no-auth` — `GET`, no `Authorization`, controls only — establishes the per-mode no-auth baseline so "stripped" is distinguishable from "preserved" within each routing channel

The previous matrix's `get-baseline-no-auth-repeat` and `get-spoof-forwarded` probes are removed from the suite. `get-baseline-no-auth-repeat` covered inject-stability across two requests on the same channel; the rewrite-vs-fallback comparison exercises two channels and is the more useful signal. `get-spoof-forwarded` covered the spoofing surface, which is orthogonal to rewrite-vs-fallback and was already addressed by the previous evidence-gathering change. Neither probe key MAY appear in the new test file.

#### Scenario: Each probe attaches only the sanitized fact object

- **WHEN** any probe runs and successfully retrieves the `DiagnosticFacts`
- **THEN** the test SHALL call `testInfo.attach` with the JSON-stringified fact object only — no `diagnosticBearer`, no `probeId`, no raw request headers, no raw response headers anywhere in the attachment

#### Scenario: Each probe asserts the per-method core

- **WHEN** any of the sixteen probes runs
- **THEN** the test SHALL assert HTTP status equals 200; that the `DiagnosticFacts` decodes successfully from the channel appropriate to the method; that `facts.method` equals the requested method; that `facts.authorizationPresent`, `facts.testAuthorizationPresent`, `facts.authorizationEqualsTestAuthorization`, and `facts.testProbeIdPresent` are present in the decoded object; and that the serialized fact attachment does NOT contain `diagnosticBearer` or `probeId` as a substring

#### Scenario: HEAD auth probe retrieves facts from response headers on both modes

- **WHEN** either the `nav-fallback/head-auth` or the `rewrite/head-auth` probe runs
- **THEN** the test SHALL read each `x-diag-*` response header, decode boolean strings to booleans and `"null"` to `null`, assemble the fact object, and assert HTTP status 200
- **AND** the test SHALL NOT attempt to read the response body for facts

#### Scenario: Non-HEAD probes retrieve facts from response body on both modes

- **WHEN** any probe with method ∈ {`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`} runs on either route mode
- **THEN** the test SHALL `JSON.parse` the response body as the fact object and assert HTTP status 200
- **AND** the test SHALL NOT read facts from `x-diag-*` response headers (which are not present for these methods)

#### Scenario: Every adapter-supported method has its own Authorization probe per route mode

- **WHEN** the test suite is enumerated
- **THEN** there SHALL exist exactly one Authorization probe per `(routeMode, method)` pair where `routeMode ∈ {'nav-fallback', 'rewrite'}` and `method ∈ {GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS}` — fourteen auth probes total — each sending `Authorization: Bearer <diagnosticBearer>` together with the three control headers
- **AND** `PATCH` and `DELETE` SHALL NOT be sampled by proxy from `POST`/`PUT` on either route mode

#### Scenario: Authorization-bearing probes report classification with route mode

- **WHEN** any of the fourteen per-mode auth probes runs
- **THEN** the test SHALL classify the outcome into exactly one of `preserved | overwritten | stripped | custom-headers-not-reaching-app` using `authorizationPresent`, `testAuthorizationPresent`, and `authorizationEqualsTestAuthorization`
- **AND** the test SHALL surface the classification together with the route mode and HTTP method via `testInfo.annotations` (or test title), and SHALL NOT assert that the classification equals any specific value

#### Scenario: Per-route-mode no-auth baseline runs once per mode

- **WHEN** the test suite is enumerated
- **THEN** there SHALL exist exactly one `get-baseline-no-auth` probe per `routeMode ∈ {'nav-fallback', 'rewrite'}` — two baselines total — each sending only the three control headers (`x-test-authorization`, `x-test-probe-id`, `x-test-expected-probe-id`) and not `Authorization`
- **AND** the baseline probes SHALL be attached as `nav-fallback/get-baseline-no-auth.json` and `rewrite/get-baseline-no-auth.json` respectively

#### Scenario: Removed probe keys are absent from the suite

- **WHEN** the test file is read
- **THEN** the strings `get-baseline-no-auth-repeat` and `get-spoof-forwarded` SHALL NOT appear in the test file, and no probe SHALL spoof `X-Forwarded-Host` or `X-Forwarded-Proto`

#### Scenario: No raw secrets in attachments or logs

- **WHEN** any probe runs
- **THEN** the test code SHALL NOT call `console.log`, `testInfo.attach`, `expect.soft`, or any other reporter sink with `diagnosticBearer`, `probeId`, raw request headers, or raw response headers as payload

#### Scenario: Probes target the configured baseURL

- **WHEN** the suite is invoked from the demo's existing Playwright configuration
- **THEN** the probes SHALL target the same base URL the demo's other e2e tests target (`baseURL` from `tests/demo/playwright.config.ts`), so the same suite can be run against the local SWA CLI emulator and against a deployed Azure environment without code changes

#### Scenario: Per-route-mode attachment naming groups output in the report

- **WHEN** any probe attaches its sanitized facts
- **THEN** the attachment name SHALL begin with the route mode (`nav-fallback/` or `rewrite/`) followed by the probe key (e.g. `get-auth.json`), so the Playwright HTML report groups attachments by routing channel
- **AND** the previous single-path naming `diagnostic-headers/<probe-key>.json` SHALL NOT be used

### Requirement: Diagnostic runbook documents how to use the probe and preserves local-vs-Azure distinction

The demo's `tests/demo/AGENTS.md` (or `tests/demo/README.md` if more appropriate) SHALL contain a section that explains the diagnostic probe to a future maintainer. The section MUST cover:

- What the probe is for and why it exists (links to issue #218 and upstream geoffrich/svelte-adapter-azure-swa#212)
- The two URL paths exposed (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`) and which SWA routing channel each one targets:
  - `/diagnostic-headers-nav-fallback` is reached, in the absence of any specific `routes` match, via the `navigationFallback.rewrite` (for `GET`/`HEAD`/`OPTIONS`) and via the auto-generated catch-all `*`-method rewrite (for `POST`/`PUT`/`PATCH`/`DELETE`).
  - `/diagnostic-headers-rewrite` is reached via an explicit per-path `rewrite` route entry added through the existing adapter option `customStaticWebAppConfig.routes`, for every adapter-supported method.
- How to run the probes locally against `swa start` using `npm run test:swa --prefix tests/demo`
- How to retrieve the captured fact attachments from the deployed environment: name the workflow (`CI`) and the relevant job (`swa / azure (<node-version>)` from the reusable `.github/workflows/ci-swa.yml`), and the existing `playwright-report-azure-node<v>` artifact uploaded by the `azure` job (no CI change in this revision; the per-mode attachments ride along with the existing artifact)
- Per-mode attachment naming: every per-test fact JSON is grouped under `nav-fallback/<probe-key>.json` or `rewrite/<probe-key>.json` in the Playwright report
- An explicit statement that **local SWA CLI emulator results are NOT the source of truth** for issue #218 — they are supporting evidence, but real Azure SWA deployment results govern the policy decision; both sets of per-mode attachments must be pasted into issue #218
- An explanation of the per-method delivery channel (`HEAD` → `x-diag-*` response headers, all other methods → JSON body) — unchanged from the previous version of the runbook
- An explanation that the routes are safe-by-design: they never emit raw `Authorization`, raw `Cookie`, raw client principal, raw token, full URL, or arbitrary unknown header values; only sanitized booleans / scheme tokens / closed-enum classifications
- An explicit reminder that captured per-mode results MUST be pasted into issue #218 as evidence before the follow-up adapter policy change is designed
- The "honest scope" caveat: in the current adapter config the `nav-fallback` channel is **navigationFallback for `GET`/`HEAD`/`OPTIONS` and the auto-generated `*`-method rewrite for `POST`/`PUT`/`PATCH`/`DELETE`**, while the `rewrite` channel is an explicit per-path rewrite for **every** method — so the cleanest comparison pairs are `(nav-fallback/get-auth, rewrite/get-auth)`, `(nav-fallback/head-auth, rewrite/head-auth)`, `(nav-fallback/options-auth, rewrite/options-auth)` for the navigationFallback-vs-rewrite axis, and `(nav-fallback/post-auth-form, rewrite/post-auth-form)` etc. for the auto-rewrite-vs-explicit-rewrite axis

#### Scenario: Both URL paths and their SWA channels are documented

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL find both URL paths (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`) named with the SWA routing channel each one targets, including the "honest scope" caveat that the `nav-fallback` URL path mixes `navigationFallback` and the catch-all `*`-method rewrite depending on method

#### Scenario: Local run instructions are present

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL find a copy-pastable command (or a pointer to `npm run test:swa --prefix tests/demo`) and a description of where the resulting report lives, with the per-mode attachment grouping explained

#### Scenario: Deployed-environment retrieval is documented

- **WHEN** the probes have been run against a deployed Azure environment
- **THEN** the runbook SHALL name the CI workflow (`CI` → reusable `CI-SWA`), the job (`swa / azure (<node-version>)`), and the existing `playwright-report-azure-node<v>` artifact (no new CI step is required)

#### Scenario: Local-vs-Azure distinction is preserved

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see an explicit statement that local SWA CLI results are not the source of truth for issue #218, and that real Azure SWA deployment results govern

#### Scenario: Safety posture is documented

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see a paragraph stating that both routes are safe-by-design (no raw values ever emitted) and that the safety model is reused unchanged from the previous diagnostic change

#### Scenario: Issue #218 reminder is present with per-mode capture expectation

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see an explicit reminder that captured per-mode results (both `nav-fallback/*.json` and `rewrite/*.json`) are intended to be pasted into issue #218 before the follow-up adapter policy change is designed

## ADDED Requirements

### Requirement: Each diagnostic route is reached through the SWA routing channel its name promises

The two diagnostic routes SHALL be reachable through distinct SWA routing channels so that requests captured at each path can be attributed cleanly to the routing configuration that delivered them. This requirement is satisfied entirely through the existing `customStaticWebAppConfig.routes` adapter option and the existing `navigationFallback` behavior emitted by [src/swa-config/index.js](src/swa-config/index.js); no new adapter option, no edit under `src/`, and no change to adapter request handling are introduced.

**`/diagnostic-headers-nav-fallback`** — the path SHALL NOT have its own explicit entry in `customStaticWebAppConfig.routes`. SWA SHALL resolve a request to this path via:

- For `GET`, `HEAD`, `OPTIONS`: the `navigationFallback.rewrite` to `/api/sk_render` emitted by `generateConfig` (no `routes` entry matches, so SWA falls through to `navigationFallback`).
- For `POST`, `PUT`, `PATCH`, `DELETE`: the auto-generated catch-all entry `{ route: '*', methods: ['POST','PUT','DELETE','PATCH'], rewrite: '/api/sk_render' }` emitted by `generateConfig`.

**`/diagnostic-headers-rewrite`** — the demo's `customStaticWebAppConfig.routes` SHALL contain exactly one entry of the shape `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }` with no `methods` filter, so SWA resolves a request to this path via that single explicit per-path `rewrite` route for **every** adapter-supported method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`). Because user-supplied `routes` are spread into the generated array before the auto-generated entries (see [src/swa-config/index.js:39-58](src/swa-config/index.js#L39-L58)), the explicit per-path rewrite takes precedence over both the catch-all `*`-method rewrite and `navigationFallback`.

#### Scenario: nav-fallback path has no explicit routes entry

- **WHEN** the demo's generated `staticwebapp.config.json` is inspected
- **THEN** the `routes` array SHALL NOT contain any entry whose `route` field equals `/diagnostic-headers-nav-fallback`
- **AND** requests to that path SHALL be resolved by the existing `navigationFallback.rewrite` (for GET-family methods) and the auto-generated catch-all `*`-method rewrite (for POST/PUT/PATCH/DELETE)

#### Scenario: rewrite path has an explicit per-path routes entry covering every method

- **WHEN** the demo's generated `staticwebapp.config.json` is inspected
- **THEN** the `routes` array SHALL contain exactly one entry of the form `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }` with no `methods` filter
- **AND** that entry SHALL be ordered before the auto-generated catch-all `*`-method rewrite so it takes precedence for every adapter-supported method

#### Scenario: Both routing channels deliver to the same SvelteKit endpoints

- **WHEN** a request is resolved by either routing channel and forwarded to the SSR function
- **THEN** the SvelteKit endpoint SHALL be the corresponding `+server.ts` under `tests/demo/src/routes/diagnostic-headers-nav-fallback/` or `tests/demo/src/routes/diagnostic-headers-rewrite/`, both delegating to `diagnose(event)` with the same `DiagnosticFacts` contract

### Requirement: Demo SWA config registers an explicit rewrite for the rewrite-mode probe path through the existing adapter option

The demo app's `tests/demo/svelte.config.js` SHALL add exactly one entry to `customStaticWebAppConfig.routes` — an existing, documented adapter option already consumed by [src/swa-config/index.js](src/swa-config/index.js) — that rewrites the URL path `/diagnostic-headers-rewrite` to the SSR function (`/api/sk_render`). The route entry MUST omit the `methods` filter so it matches every HTTP method, ensuring all seven adapter-supported methods reach the rewrite-mode probe via the explicit per-path `rewrite` route. The entry MUST be the only addition to `customStaticWebAppConfig` for this change; no other adapter option, no other `routes` entry, and no new SWA configuration field MAY be introduced.

This requirement is satisfied entirely through the existing adapter API surface. No file under `src/` MAY be edited as part of this change. No new adapter option MAY be introduced.

#### Scenario: Explicit rewrite entry is present in the demo SWA config

- **WHEN** the demo's `tests/demo/svelte.config.js` is read
- **THEN** the `customStaticWebAppConfig.routes` array SHALL contain an entry of the form `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }` (or equivalent — any spelling that produces the same SWA route entry) with no `methods` filter

#### Scenario: Generated staticwebapp.config.json contains the explicit rewrite

- **WHEN** the demo is built and `staticwebapp.config.json` is generated by `writeSWAConfig`
- **THEN** the generated `routes` array SHALL contain the `{ route: '/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }` entry, ordered before the auto-generated catch-all `*`-method rewrite

#### Scenario: No new adapter option is introduced

- **WHEN** the change is implemented
- **THEN** the diff SHALL NOT add, rename, or remove any adapter option in `src/index.js` or any file under `src/`
- **AND** the only adapter API surface used to register the explicit rewrite SHALL be the existing `customStaticWebAppConfig.routes` option

### Requirement: Adapter request behavior is unchanged

This change SHALL NOT modify any adapter request-handling code. No file under `src/` MAY be edited. `toRequest` semantics SHALL remain unchanged. No header-normalization logic SHALL be introduced. No `Authorization` stripping, moving, renaming, or normalization SHALL occur as a result of this change. No new adapter option SHALL be added.

#### Scenario: No adapter source files are modified

- **WHEN** the change is implemented
- **THEN** the diff SHALL NOT touch any file under `src/` (in particular not `src/server/entry/entry.js`, `src/swa-config/index.js`, or `src/index.js`) and SHALL NOT add, alter, or remove any adapter option

#### Scenario: Authorization handling is not modified

- **WHEN** the change is implemented
- **THEN** the diff SHALL NOT introduce code under `src/` or under the demo's adapter-config surface that strips, renames, moves, or normalizes the `Authorization` header on inbound requests

### Requirement: CI workflows are unchanged for this change

This change SHALL NOT modify any file under `.github/workflows/`. The Playwright report artifact uploaded by the previous archived change's `azure` job step in [.github/workflows/ci-swa.yml](.github/workflows/ci-swa.yml) is reused as-is; the new per-mode attachments are written to the same `tests/demo/playwright-report` directory and ride along with the existing artifact. No new artifact upload step, no new artifact name, and no other CI configuration change SHALL be introduced as part of this change.

#### Scenario: No workflow files are touched

- **WHEN** the change is implemented
- **THEN** `git diff .github/` SHALL produce no output, and no file under `.github/workflows/` SHALL be added, removed, or modified

#### Scenario: Existing artifact upload covers the new attachments

- **WHEN** the deployed `azure` job in CI-SWA runs the Playwright suite against an Azure SWA preview URL
- **THEN** the existing `actions/upload-artifact@v7` step (added by the previous archived change) SHALL upload `tests/demo/playwright-report` containing both `nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json` per-mode attachment groups, with no additional CI step required

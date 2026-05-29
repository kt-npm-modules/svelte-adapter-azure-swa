## ADDED Requirements

### Requirement: Demo diagnostic route exposes only sanitized facts

The demo app SHALL expose a SvelteKit `+server.ts` route at `/diagnostic-headers` that handles every HTTP method registered by the adapter — `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — all delegating to a shared `diagnose(event)` helper. No method MAY return 405. The helper MUST compute a `DiagnosticFacts` object server-side and emit only that object; it MUST NOT return raw request header values, raw cookies, raw client principals, raw tokens, full URLs (with host or query), or arbitrary unknown header values in any form (response body, response headers, log output reachable by callers, or any side channel).

The `DiagnosticFacts` object MUST consist of exactly the following fields, all values being booleans, `null`, short strings drawn from a closed enum / scheme token, or non-secret server-generated values:

- `method`: the HTTP method as observed by the handler (string)
- `requestUrlProtocol`: the URL protocol (e.g. `"https:"`, `"http:"`) — non-secret
- `requestUrlHostKind`: one of `"public" | "internal-azure-functions" | "localhost" | "unknown"` — closed enum, host value itself NOT returned
- `requestUrlPathname`: the URL path (e.g. `"/diagnostic-headers"`) — query string and fragment MUST NOT be returned
- `authorizationPresent`: boolean
- `testAuthorizationPresent`: boolean
- `authorizationScheme`: scheme token (lowercased) or `null`, computed by the strict fail-closed rule defined in the **Authorization scheme extraction fails closed** requirement below
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

#### Scenario: Every adapter-supported method responds 200 and echoes its method

- **WHEN** a client issues a request with method `M` against `/diagnostic-headers`, where `M` is any of `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- **THEN** the route SHALL respond with HTTP 200 and the emitted `DiagnosticFacts` object's `method` field SHALL equal `M`

#### Scenario: No raw sensitive values are emitted

- **WHEN** a request arrives carrying any value in `Authorization`, `x-test-authorization`, `Cookie`, `x-ms-client-principal`, or any other sensitive header
- **THEN** the response (body and headers, both channels) SHALL NOT contain any substring of the raw header value, beyond the lowercased scheme token (computed by the strict fail-closed rule below) for `Authorization` and `x-test-authorization`
- **AND** the response SHALL NOT contain any full URL with host or query string

#### Scenario: Raw request.headers dump is forbidden

- **WHEN** the route is implemented
- **THEN** the response (body and headers) SHALL NOT contain a `request.headers` field, an arbitrary header map, or any other structure that exposes raw values of unknown headers; the only header-derived data emitted SHALL be the sanitized boolean / scheme-token / classification fields enumerated in this requirement

#### Scenario: URL host is never echoed verbatim

- **WHEN** the diagnostic-fact object is built
- **THEN** the URL host SHALL be classified into the `requestUrlHostKind` closed enum and the raw host value SHALL NOT appear in the response

### Requirement: Authorization comparator detects preserve / overwrite / strip / unreached

The `diagnose(event)` helper SHALL compute `authorizationPresent`, `testAuthorizationPresent`, schemes, `looksBearer` flags, and `authorizationEqualsTestAuthorization` such that the four observable Authorization outcomes can be distinguished from the booleans alone, without inspecting raw header values:

- **Preserved**: `authorizationPresent === true && testAuthorizationPresent === true && authorizationEqualsTestAuthorization === true`
- **Overwritten / injected**: `authorizationPresent === true && testAuthorizationPresent === true && authorizationEqualsTestAuthorization === false`
- **Stripped**: `authorizationPresent === false && testAuthorizationPresent === true`
- **Custom headers not reaching app**: `testAuthorizationPresent === false`

When both `Authorization` and `x-test-authorization` are present, the equality comparison SHALL use a constant-time byte comparison (e.g. `crypto.timingSafeEqual` over UTF-8-encoded buffers; lengths checked first). When either is absent, `authorizationEqualsTestAuthorization` SHALL be `null`.

#### Scenario: Preserved outcome

- **WHEN** the request carries identical `Authorization` and `x-test-authorization` values
- **THEN** the response SHALL report `authorizationPresent === true`, `testAuthorizationPresent === true`, and `authorizationEqualsTestAuthorization === true`

#### Scenario: Overwritten outcome

- **WHEN** the request carries `Authorization: A` and `x-test-authorization: B` with `A !== B` (e.g. SWA replaced the inbound `Authorization`)
- **THEN** the response SHALL report `authorizationPresent === true`, `testAuthorizationPresent === true`, and `authorizationEqualsTestAuthorization === false`

#### Scenario: Stripped outcome

- **WHEN** `Authorization` is absent and `x-test-authorization` is present
- **THEN** the response SHALL report `authorizationPresent === false`, `testAuthorizationPresent === true`, and `authorizationEqualsTestAuthorization === null`

#### Scenario: Custom headers not reaching the app

- **WHEN** `x-test-authorization` is absent
- **THEN** the response SHALL report `testAuthorizationPresent === false` (and `authorizationEqualsTestAuthorization === null`)

#### Scenario: Constant-time equality compare

- **WHEN** the helper compares `Authorization` against `x-test-authorization`
- **THEN** the comparison SHALL be byte-wise constant-time over the UTF-8 encoding (length-checked first) and SHALL NOT short-circuit on the first differing byte in a way that leaks timing information

### Requirement: Probe-id comparator emits only booleans

When the request carries both `x-test-probe-id` and `x-test-expected-probe-id`, the helper SHALL compute `testProbeIdMatchesExpected` via constant-time byte comparison and SHALL NOT return either raw value in the response. When either header is absent, `testProbeIdMatchesExpected` SHALL be `null`. `testProbeIdPresent` reports whether `x-test-probe-id` was observed.

#### Scenario: Probe-id match

- **WHEN** the request carries `x-test-probe-id: X` and `x-test-expected-probe-id: X`
- **THEN** the response SHALL report `testProbeIdPresent === true` and `testProbeIdMatchesExpected === true`, and SHALL NOT contain `X` anywhere in the response

#### Scenario: Probe-id mismatch

- **WHEN** the request carries `x-test-probe-id: X` and `x-test-expected-probe-id: Y` with `X !== Y`
- **THEN** the response SHALL report `testProbeIdPresent === true` and `testProbeIdMatchesExpected === false`, and SHALL NOT contain either raw value

#### Scenario: Probe-id absent

- **WHEN** `x-test-probe-id` is absent
- **THEN** the response SHALL report `testProbeIdPresent === false` and `testProbeIdMatchesExpected === null`

### Requirement: Authorization scheme extraction fails closed

The helper SHALL compute `authorizationScheme` and `testAuthorizationScheme` by a strict regex match — never by a substring-before-first-whitespace fallback. A header value `v` yields a non-`null` scheme **only if** `v` matches the anchored, case-insensitive pattern `^[A-Za-z][A-Za-z0-9+\-.]{0,15}\s+\S` — i.e. a 1–16-character RFC-9110-shaped scheme token followed by whitespace followed by at least one credential byte. When matched, the captured token MUST be lowercased and emitted. When unmatched (no whitespace, leading whitespace, empty value, single token without credential, header absent, or token outside the allowed alphabet), the emitted scheme MUST be `null`. The helper MUST NOT return any substring of an unmatched header value as the scheme. The same rule applies identically to `Authorization` and `x-test-authorization`.

This rule exists so that malformed `Authorization`-like values such as `SECRET_WITHOUT_SCHEME` cannot be partially exposed via the scheme field — they yield `null`, not a 16-character substring of the raw value.

#### Scenario: Well-formed Bearer

- **WHEN** the header is `Bearer abc.def.ghi`
- **THEN** the emitted scheme SHALL be `"bearer"` and `authorizationLooksBearer` SHALL be `true`

#### Scenario: Well-formed Basic

- **WHEN** the header is `Basic dXNlcjpwYXNz`
- **THEN** the emitted scheme SHALL be `"basic"` and `authorizationLooksBearer` SHALL be `false`

#### Scenario: Malformed value without whitespace

- **WHEN** the header is `SECRET_WITHOUT_SCHEME` (no whitespace, no credential)
- **THEN** the emitted scheme SHALL be `null` and the response SHALL NOT contain any substring of the value

#### Scenario: Header value with no credential after scheme

- **WHEN** the header is `Bearer ` (trailing whitespace, no credential bytes)
- **THEN** the emitted scheme SHALL be `null`

#### Scenario: Leading whitespace before scheme

- **WHEN** the header is `   Bearer abc`
- **THEN** the emitted scheme SHALL be `null` (the regex is anchored to the start)

#### Scenario: Token longer than 16 characters

- **WHEN** the header is `MyVeryLongCustomSchemeName abc`
- **THEN** the emitted scheme SHALL be `null`

#### Scenario: Token contains characters outside the allowed alphabet

- **WHEN** the header is `Foo:bar abc` (colon is not allowed in the scheme alphabet)
- **THEN** the emitted scheme SHALL be `null`

#### Scenario: Header absent

- **WHEN** the header is absent
- **THEN** the emitted scheme SHALL be `null` and the corresponding `present` boolean SHALL be `false`

### Requirement: Forwarded/host classification fields

For each of `host`, `x-ms-original-url`, `x-forwarded-host`, `x-forwarded-proto`, `x-forwarded-for`, `x-ms-client-principal`, the helper SHALL emit only the sanitized fields enumerated in the first requirement and SHALL NOT emit the raw header value. Specifically, the helper SHALL:

- Compute `hostLooksInternalAzureFunctionsHost` as a regex match against `*.azurewebsites.net` (port-stripped) over the inbound `host` header — emit only the boolean.
- Compute `xMsOriginalUrlLooksAbsolute` as a check that the value starts with `http://` or `https://` — emit only the boolean.
- Compute `xMsOriginalUrlHostEqualsUrlHost` by parsing both `x-ms-original-url` and `event.url`, comparing their hosts, and emitting only the boolean (or `null` if either side fails to parse).
- Emit only presence booleans for `xForwardedHostPresent`, `xForwardedProtoPresent`, `xForwardedForPresent`, `xMsClientPrincipalPresent`.

#### Scenario: Internal Azure Functions host classification

- **WHEN** the inbound `host` header matches `*.azurewebsites.net` (port-stripped)
- **THEN** `hostPresent` SHALL be `true` and `hostLooksInternalAzureFunctionsHost` SHALL be `true`
- **AND** the response SHALL NOT contain the raw host value or any GUID extracted from it

#### Scenario: x-ms-original-url host comparison

- **WHEN** both `x-ms-original-url` and `event.url` parse as absolute URLs
- **THEN** `xMsOriginalUrlHostEqualsUrlHost` SHALL be `true` if their hosts match, `false` otherwise; the raw URL values SHALL NOT appear in the response

### Requirement: Snapshot is delivered via a single HTTP-semantic channel per method

The shared `diagnose(event)` helper SHALL deliver the `DiagnosticFacts` object via exactly one channel per method, dictated by HTTP semantics:

- For `HEAD` requests: the body MUST be empty (RFC 9110 §9.3.2). Each fact field MUST be emitted as a separate response header named `x-diag-<kebab-case-key>` (e.g. `x-diag-authorization-present`, `x-diag-request-url-host-kind`, `x-diag-request-id`). Boolean values MUST be encoded as the literal strings `"true"`, `"false"`, or `"null"`. String classification values MUST come from the closed enum defined in the first requirement. No `x-diag-*` header MAY contain a raw header value or full URL.
- For `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` requests: the response body MUST be the JSON serialization of the `DiagnosticFacts` object with `Content-Type: application/json`. These methods MUST NOT set any `x-diag-*` response header.

The header-name prefix MUST be `x-diag-`; an `x-ms-*` prefix MUST NOT be used (reserved by SWA, may be filtered by the edge).

#### Scenario: HEAD delivers facts via response headers with empty body

- **WHEN** a client issues `HEAD /diagnostic-headers`
- **THEN** the response SHALL have HTTP status 200, an empty body, and one `x-diag-*` response header per fact field, with values that are booleans (`"true"`/`"false"`/`"null"`), enum strings, scheme tokens, or non-secret server-generated identifiers

#### Scenario: Non-HEAD methods deliver facts via JSON body

- **WHEN** a client issues a request with method `M ∈ {GET, POST, PUT, PATCH, DELETE, OPTIONS}` against `/diagnostic-headers`
- **THEN** the response SHALL have HTTP status 200, `Content-Type: application/json`, and a body parseable as the `DiagnosticFacts` object
- **AND** the response SHALL NOT include any `x-diag-*` header

### Requirement: Playwright probe matrix exercises the route safely

A Playwright e2e test file at `tests/demo/e2e/diagnostic-headers.test.ts` SHALL drive the route via Playwright's `request` fixture (`APIRequestContext`) — not browser navigation — and run a fixed 10-probe matrix consisting of seven Authorization probes (one per adapter-supported HTTP method, tested directly) plus three additional `GET` probes for forwarded-header concerns. Each probe MUST:

- Generate a unique-per-run `diagnosticBearer` (random base64url, e.g. 32 bytes from `crypto.randomBytes`) and `probeId` (random UUID).
- Send `Authorization: Bearer <diagnosticBearer>` on every probe that is testing the Authorization channel for its method (the seven per-method auth probes); send `x-test-authorization: Bearer <diagnosticBearer>` on every probe; send `x-test-probe-id: <probeId>` and `x-test-expected-probe-id: <probeId>` on every probe.
- Retrieve the `DiagnosticFacts` object via the channel appropriate to the probe's method (JSON body for non-HEAD; `x-diag-*` response headers for HEAD).
- Attach **only the sanitized `DiagnosticFacts` object** to the Playwright report via `testInfo.attach('diagnostic-headers/<probe-key>.json', { body: <stringified JSON>, contentType: 'application/json' })`. The test MUST NOT log, attach, or otherwise persist `diagnosticBearer`, `probeId`, raw request headers, or raw response headers.
- Assert HTTP status equals 200; the fact object decodes successfully with the expected field shape; `facts.method` equals the requested method; the comparator booleans `authorizationPresent`, `testAuthorizationPresent`, `authorizationEqualsTestAuthorization`, and `testProbeIdPresent` are present in the decoded facts; the serialized fact attachment contains neither `diagnosticBearer` nor `probeId` (string-search guard). Assert nothing about the _values_ of the comparator booleans (`authorizationEqualsTestAuthorization`, `xMsOriginalUrlHostEqualsUrlHost`, etc.) — those are findings, not regressions.
- For probes that send `Authorization`, classify the observed outcome into one of `preserved | overwritten | stripped | custom-headers-not-reaching-app` per the comparator-requirement table, and report the classification via `testInfo.annotations` (or test name) so a maintainer can read it from the Playwright report without parsing JSON.

The probe matrix is exactly **ten probes — seven Authorization probes (one per adapter-supported HTTP method) plus three additional `GET` probes for forwarded-header concerns**:

**Auth probes — one per method (each tested directly; `PATCH` and `DELETE` are NOT sampled by proxy from `POST`/`PUT`):**

1. `get-auth` — `GET`, `Authorization` + controls
2. `head-auth` — `HEAD`, `Authorization` + controls
3. `post-auth-form` — `POST`, `Authorization` + controls + `Content-Type: application/x-www-form-urlencoded`, body `foo=bar`
4. `put-auth-json` — `PUT`, `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`
5. `patch-auth-json` — `PATCH`, `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`
6. `delete-auth` — `DELETE`, `Authorization` + controls
7. `options-auth` — `OPTIONS`, `Authorization` + controls

**Additional forwarded-header probes (do not replace the per-method auth probes above):**

8. `get-baseline-no-auth` — `GET`, no `Authorization`, controls only — establishes the no-auth baseline so "stripped" is distinguishable from "preserved"
9. `get-baseline-no-auth-repeat` — `GET`, no `Authorization`, controls only, separate test, fresh values — checks SWA's injection stability
10. `get-spoof-forwarded` — `GET`, controls + `X-Forwarded-Host: evil.example` + `X-Forwarded-Proto: gopher` — spoofing surface probe

#### Scenario: Each probe attaches only the sanitized fact object

- **WHEN** any probe runs and successfully retrieves the `DiagnosticFacts`
- **THEN** the test SHALL call `testInfo.attach` with the JSON-stringified fact object only — no `diagnosticBearer`, no `probeId`, no raw request headers, no raw response headers anywhere in the attachment

#### Scenario: Each probe asserts the per-method core

- **WHEN** any of the ten probes runs
- **THEN** the test SHALL assert HTTP status equals 200; that the `DiagnosticFacts` decodes successfully from the channel appropriate to the method; that `facts.method` equals the requested method; that `facts.authorizationPresent`, `facts.testAuthorizationPresent`, `facts.authorizationEqualsTestAuthorization`, and `facts.testProbeIdPresent` are present in the decoded object; and that the serialized fact attachment does NOT contain `diagnosticBearer` or `probeId` as a substring

#### Scenario: HEAD auth probe retrieves facts from response headers

- **WHEN** the `head-auth` probe runs
- **THEN** the test SHALL read each `x-diag-*` response header, decode boolean strings to booleans and `"null"` to `null`, assemble the fact object, and assert HTTP status 200
- **AND** the test SHALL NOT attempt to read the response body for facts

#### Scenario: Non-HEAD probes retrieve facts from response body

- **WHEN** any probe with method ∈ {`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`} runs
- **THEN** the test SHALL `JSON.parse` the response body as the fact object and assert HTTP status 200
- **AND** the test SHALL NOT read facts from `x-diag-*` response headers (which are not present for these methods)

#### Scenario: Every adapter-supported method has its own Authorization probe

- **WHEN** the test suite is enumerated
- **THEN** there SHALL exist exactly one Authorization probe per method in `{GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS}` — each sending `Authorization: Bearer <diagnosticBearer>` together with the three control headers — and `PATCH` and `DELETE` SHALL NOT be sampled by proxy from `POST`/`PUT`

#### Scenario: Authorization-bearing probes report classification

- **WHEN** any of probes `get-auth`, `head-auth`, `post-auth-form`, `put-auth-json`, `patch-auth-json`, `delete-auth`, `options-auth` runs
- **THEN** the test SHALL classify the outcome into exactly one of `preserved | overwritten | stripped | custom-headers-not-reaching-app` using `authorizationPresent`, `testAuthorizationPresent`, and `authorizationEqualsTestAuthorization`
- **AND** the test SHALL surface the classification per method via `testInfo.annotations` (or test title), and SHALL NOT assert that the classification equals any specific value

#### Scenario: No raw secrets in attachments or logs

- **WHEN** any probe runs
- **THEN** the test code SHALL NOT call `console.log`, `testInfo.attach`, `expect.soft`, or any other reporter sink with `diagnosticBearer`, `probeId`, raw request headers, or raw response headers as payload

#### Scenario: Probes target the configured baseURL

- **WHEN** the suite is invoked from the demo's existing Playwright configuration
- **THEN** the probes SHALL target the same base URL the demo's other e2e tests target (`baseURL` from `tests/demo/playwright.config.ts`), so the same suite can be run against the local SWA CLI emulator and against a deployed Azure environment without code changes

### Requirement: Diagnostic runbook documents how to use the probe and preserves local-vs-Azure distinction

The demo's `tests/demo/AGENTS.md` (or `tests/demo/README.md` if more appropriate) SHALL contain a section that explains the diagnostic probe to a future maintainer. The section MUST cover:

- What the probe is for and why it exists (links to issue #218 and upstream geoffrich/svelte-adapter-azure-swa#212)
- How to run it locally against `swa start` using `npm run test:swa --prefix tests/demo`
- How to retrieve the captured fact attachments from the deployed environment: name the workflow (`CI`) and the relevant job (`swa / azure (<node-version>)` from the reusable `.github/workflows/ci-swa.yml`), and the `playwright-report-azure-node<v>` artifact uploaded by the `azure` job
- An explicit statement that **local SWA CLI emulator results are NOT the source of truth** for issue #218 — they are supporting evidence, but real Azure SWA deployment results govern the policy decision; both sets must be pasted into issue #218
- An explanation of the per-method delivery channel (`HEAD` → `x-diag-*` response headers, all other methods → JSON body)
- An explanation that the route is safe-by-design: it never emits raw `Authorization`, raw `Cookie`, raw client principal, raw token, full URL, or arbitrary unknown header values; only sanitized booleans / scheme tokens / closed-enum classifications
- An explicit reminder that captured results MUST be pasted into issue #218 as evidence before the follow-up adapter policy change is designed

#### Scenario: Local run instructions are present

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL find a copy-pastable command (or a pointer to `npm run test:swa --prefix tests/demo`) and a description of where the resulting report lives

#### Scenario: Deployed-environment retrieval is documented

- **WHEN** the probe has been run against a deployed Azure environment
- **THEN** the runbook SHALL name the CI workflow (`CI` → reusable `CI-SWA`), the job (`swa / azure (<node-version>)`), and the `playwright-report-azure-node<v>` artifact

#### Scenario: Local-vs-Azure distinction is preserved

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see an explicit statement that local SWA CLI results are not the source of truth for issue #218, and that real Azure SWA deployment results govern

#### Scenario: Safety posture is documented

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see a paragraph stating that the route is safe-by-design (no raw values ever emitted)

#### Scenario: Issue #218 reminder is present

- **WHEN** a maintainer reads the runbook section
- **THEN** they SHALL see an explicit reminder that captured results are intended to be pasted into issue #218 before the follow-up adapter policy change is designed

### Requirement: CI-SWA `azure` job uploads the Playwright report in repository style

The reusable workflow `.github/workflows/ci-swa.yml` job `azure` SHALL upload `tests/demo/playwright-report` as a CI artifact after the Playwright run completes, using `actions/upload-artifact@v7` with `if: always()` so the artifact is produced even when a probe fails. The step MUST follow the repository's existing upload-artifact convention as established by the two existing steps in `ci-swa.yml` (job `cli`) and `ci.yml` (job `test`):

- Action pinned to `actions/upload-artifact@v7`
- Step keys ordered: `name:` → `if:` → `uses:` → `with:`
- `if: always()` literal
- `if-no-files-found: error` literal
- 2-space YAML indent
- Single-quoted strings where appropriate
- No SHA pinning (the repo uses floating tags everywhere)
- Artifact name disambiguated across the node-version matrix (e.g. via a job-level `env` variable referenced as `${{ env.PLAYWRIGHT_REPORT_NAME }}`, mirroring the existing `${{ env.COVERAGE_DIR }}` pattern)

This change SHALL NOT modify any other CI behavior: the existing build, deploy, coverage-upload, concurrency, environment, trigger, and step ordering of the `azure` job and unrelated jobs remain untouched. The change is additive (one step) and SHALL NOT introduce unrelated workflow modernization.

#### Scenario: Artifact is uploaded after Playwright runs

- **WHEN** the `azure` job in CI-SWA executes its Playwright step
- **THEN** a subsequent `actions/upload-artifact@v7` step SHALL upload `tests/demo/playwright-report` under a node-version-distinguished name with `if: always()` and `if-no-files-found: error`, in the same step-key order and YAML style as the existing upload-artifact step in the `cli` job

#### Scenario: No unrelated CI changes

- **WHEN** the change is implemented
- **THEN** the diff to `.github/workflows/ci-swa.yml` SHALL be limited to (a) adding the `actions/upload-artifact@v7` step in the `azure` job and (b) at most adding the supporting job-level `env` variable for the artifact name; SHALL NOT alter the existing build, deploy, test, coverage-upload, concurrency, environment, trigger, or step-ordering configuration; and SHALL NOT touch any other workflow file

#### Scenario: Artifact contains only sanitized facts

- **WHEN** the artifact is produced from a CI run
- **THEN** every `diagnostic-headers/<probe-key>.json` attachment in the report SHALL contain only the sanitized `DiagnosticFacts` object — no `diagnosticBearer`, `probeId`, raw request headers, raw response headers, or full URLs

### Requirement: Adapter behavior is unchanged

This change SHALL NOT modify any adapter code, adapter options, or `toRequest` semantics. No file under `src/` MAY be edited, no new adapter option MAY be introduced, and no header-normalization logic MAY be added as part of this change.

#### Scenario: No adapter source files are modified

- **WHEN** the change is implemented
- **THEN** the diff SHALL NOT touch any file under `src/` (in particular not `src/server/entry/entry.js`) and SHALL NOT add or alter adapter options

## 1. Diagnostic helper module

- [x] 1.1 Create a small module (e.g. `tests/demo/src/lib/diagnose.ts`) exporting a pure `diagnose(event)` function and a `DiagnosticFacts` TypeScript type matching the field list in the spec
- [x] 1.2 Implement `requestUrlHostKind` classification: `localhost` if host is `localhost` / `127.0.0.1` / `::1`; `internal-azure-functions` if host matches `*.azurewebsites.net` after stripping any port; `public` for other resolvable-looking hostnames; `unknown` if host is missing or fails to parse
- [x] 1.3 Implement **fail-closed** scheme extraction for `Authorization` and `x-test-authorization` per Decision 14: match the strict regex `/^([A-Za-z][A-Za-z0-9+\-.]{0,15})\s+\S/` (case-insensitive on the first capture). If matched, lowercase the captured token and return it. If unmatched (no whitespace, leading whitespace, empty, single token without credential, header absent, or token outside the allowed alphabet) return `null`. Do NOT use a "substring before first whitespace" fallback — that would leak substrings of malformed values like `SECRET_WITHOUT_SCHEME`. Derive `authorizationLooksBearer` / `testAuthorizationLooksBearer` from `scheme === 'bearer'`.
- [x] 1.4 Implement `authorizationEqualsTestAuthorization` using `crypto.timingSafeEqual` over UTF-8-encoded `Buffer`s, length-checked first; return `null` if either header is absent. Same pattern for `testProbeIdMatchesExpected`
- [x] 1.5 Implement `xMsOriginalUrl*` fields: parse with `URL`, compare hosts case-insensitively against `event.url` host; emit only the booleans, never the parsed URL strings
- [x] 1.6 Implement `hostLooksInternalAzureFunctionsHost` from the inbound `host` header (port-stripped regex against `*.azurewebsites.net`)
- [x] 1.7 Add presence booleans for `xForwardedHostPresent`, `xForwardedProtoPresent`, `xForwardedForPresent`, `xMsClientPrincipalPresent`, `hostPresent`
- [x] 1.8 Generate `requestId` via `crypto.randomUUID()` and `timestamp` via `new Date().toISOString()`
- [x] 1.9 Add a unit test (vitest) that exercises `diagnose(event)` against synthetic inputs and confirms: no field of the returned object equals or contains the raw `Authorization` / `x-test-authorization` / `x-test-probe-id` / `x-test-expected-probe-id` / `x-ms-client-principal` / `host` value, beyond the lowercased scheme token. This is the safety-by-design regression test.

## 2. Diagnostic route

- [x] 2.1 Create `tests/demo/src/routes/diagnostic-headers/+server.ts` exporting `RequestHandler`s for all seven adapter-supported methods: `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — each calling `diagnose(event)` and serializing per Decision 7
- [x] 2.2 For non-HEAD methods: return `new Response(JSON.stringify(facts), { status: 200, headers: { 'content-type': 'application/json' } })`. Do NOT set any `x-diag-*` response header on these methods.
- [x] 2.3 For `HEAD`: build a `Headers` object with one `x-diag-<kebab-case-key>` entry per fact field; encode booleans as `"true"`/`"false"`/`"null"`, strings as-is (already constrained to closed enums or short non-secret tokens). Return `new Response(null, { status: 200, headers })` — empty body, no `Content-Type: application/json`.
- [x] 2.4 Add a tiny helper `factsToDiagHeaders(facts): Record<string, string>` so the kebab-case mapping is testable in isolation; cover it with a unit test
- [x] 2.5 Verify locally: `npm run dev --prefix tests/demo`, then `curl -i http://localhost:5173/diagnostic-headers` (JSON body, no `x-diag-*`), `curl -I http://localhost:5173/diagnostic-headers` (empty body, full `x-diag-*` set), `curl -i -X PUT http://localhost:5173/diagnostic-headers` (JSON body, no `x-diag-*`)
- [x] 2.6 Manually inspect a `curl -i -H 'Authorization: Bearer SECRET-LOCAL-CHECK' -H 'x-test-authorization: Bearer SECRET-LOCAL-CHECK' -H 'cookie: realcookie=abc' http://localhost:5173/diagnostic-headers` response and confirm the body and headers contain neither `SECRET-LOCAL-CHECK` nor `realcookie=abc` anywhere

## 3. Playwright probe matrix

- [x] 3.1 Create `tests/demo/e2e/diagnostic-headers.test.ts` importing from `@playwright/test` and Node's `crypto`
- [x] 3.2 Per-test helper: generate `diagnosticBearer` from `crypto.randomBytes(32).toString('base64url')`, `probeId` from `crypto.randomUUID()`. These values stay in test-local scope; never logged, attached, or otherwise persisted.
- [x] 3.3 Build the per-probe header bag in a helper `controlHeaders(diagnosticBearer, probeId, { authorization }: { authorization: boolean })` that always returns `x-test-authorization`, `x-test-probe-id`, `x-test-expected-probe-id`, and conditionally `Authorization`
- [x] 3.4 Helper `getFacts(response, method)`: for `HEAD`, read each `x-diag-*` response header, decode `"true"`/`"false"`/`"null"` to JS values, assemble object; otherwise `await response.json()`. Returns the `DiagnosticFacts` object.
- [x] 3.5 Helper `attachFacts(testInfo, probeKey, facts)` calling `testInfo.attach('diagnostic-headers/${probeKey}.json', { body: JSON.stringify(facts, null, 2), contentType: 'application/json' })`
- [x] 3.6 Helper `classifyAuthorization(facts)` returning `'preserved' | 'overwritten' | 'stripped' | 'custom-headers-not-reaching-app'` per Decision 4 of design.md
- [x] 3.7 Helper `assertCoreShape(facts, expectedMethod, diagnosticBearer, probeId)` asserting: `facts.method === expectedMethod`; `facts` has the keys `authorizationPresent`, `testAuthorizationPresent`, `authorizationEqualsTestAuthorization`, `testProbeIdPresent`; `JSON.stringify(facts)` does NOT contain `diagnosticBearer` or `probeId`. This is the per-probe core assertion.
- [x] 3.8 **Auth probe `get-auth`** — `GET` with `Authorization` + controls; `assertCoreShape`; `classifyAuthorization` and add result to `testInfo.annotations` keyed by method
- [x] 3.9 **Auth probe `head-auth`** — `HEAD` with `Authorization` + controls (use `request.head` or `request.fetch(url, { method: 'HEAD' })`); `assertCoreShape`; classify and annotate
- [x] 3.10 **Auth probe `post-auth-form`** — `POST` with `Authorization` + controls + `Content-Type: application/x-www-form-urlencoded`, body `foo=bar`; `assertCoreShape`; classify and annotate
- [x] 3.11 **Auth probe `put-auth-json`** — `PUT` with `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`; `assertCoreShape`; classify and annotate
- [x] 3.12 **Auth probe `patch-auth-json`** — `PATCH` with `Authorization` + controls + `Content-Type: application/json`, body `{"foo":"bar"}`; `assertCoreShape`; classify and annotate. **Tested directly — not sampled by proxy from `POST`/`PUT`.**
- [x] 3.13 **Auth probe `delete-auth`** — `DELETE` with `Authorization` + controls (no body); `assertCoreShape`; classify and annotate. **Tested directly — not sampled by proxy from `POST`/`PUT`.**
- [x] 3.14 **Auth probe `options-auth`** — `OPTIONS` with `Authorization` + controls (no body); `assertCoreShape`; classify and annotate
- [x] 3.15 Forwarded probe `get-baseline-no-auth` — `GET`, no `Authorization`, controls only; `assertCoreShape` with `expectedMethod = 'GET'`; do not classify (no `Authorization` was sent)
- [x] 3.16 Forwarded probe `get-baseline-no-auth-repeat` — separate `test()`, fresh generated values, otherwise identical to `get-baseline-no-auth`
- [x] 3.17 Forwarded probe `get-spoof-forwarded` — `GET` with controls + `X-Forwarded-Host: evil.example` + `X-Forwarded-Proto: gopher`; `assertCoreShape`
- [x] 3.18 Confirm the suite picks up `playwright.config.ts` `baseURL` (no hard-coded host) so it works against `swa start` and a deployed `PLAYWRIGHT_TEST_BASE_URL`

## 4. Runbook documentation

- [x] 4.1 Add a `## Forwarded-headers diagnostic probe` section to `tests/demo/AGENTS.md` (or `tests/demo/README.md` if `AGENTS.md` proves wrong on inspection)
- [x] 4.2 Document purpose: links to issues #218 and upstream geoffrich/svelte-adapter-azure-swa#212; the four observable Authorization outcomes the probe distinguishes per HTTP method; the two SWA routing paths the demo exercises
- [x] 4.3 Document local run: `npm run test:swa --prefix tests/demo` → `tests/demo/playwright-report`; mention this expands to `npm run build:swa && PUBLIC_SWA_CLI=true npm run test`, which launches `swa start` on port 4280
- [x] 4.4 Document deployed run: open a PR against `main`; **CI** workflow's `swa` job invokes **CI-SWA** at `.github/workflows/ci-swa.yml`; in the GitHub Actions UI find `swa / azure (<node-version>)`; download the `playwright-report-azure-node<v>` artifact; the ten `diagnostic-headers/<probe-key>.json` attachments are inside (open via `npx playwright show-report tests/demo/playwright-report`)
- [x] 4.5 **Local-vs-Azure**: state explicitly that local SWA CLI emulator results are not the source of truth — they're supporting evidence; real Azure SWA deployment results govern issue #218; both sets must be pasted in the issue
- [x] 4.6 Document the per-method delivery channel (`HEAD` → `x-diag-*` headers, all other methods → JSON body)
- [x] 4.7 **Safety posture**: state explicitly that the route is safe-by-design — no raw `Authorization`, `Cookie`, client principal, token, full URL, or arbitrary unknown header values are ever emitted; only sanitized booleans / scheme tokens (computed by the strict fail-closed regex) / closed-enum classifications
- [x] 4.8 Add the explicit reminder that captured results MUST be pasted into issue #218 as evidence before the follow-up adapter policy change is designed

## 5. CI artifact upload (repo-style)

- [x] 5.1 Edit `.github/workflows/ci-swa.yml`. At the job-level `env:` block of the `azure` job, add a new line: `PLAYWRIGHT_REPORT_NAME: playwright-report-azure-node${{ matrix.node-version }}` (mirroring the existing `COVERAGE_DIR: coverage-swa-node${{ matrix.node-version }}` pattern in the `cli` job)
- [x] 5.2 In the `azure` job, append one step after the existing Playwright run step (currently the last step in the job), in the exact style of the existing `Upload coverage artifact` step in the `cli` job:
      `          - name: Upload Playwright report artifact
if: always()
uses: actions/upload-artifact@v7
with:
  name: ${{ env.PLAYWRIGHT_REPORT_NAME }}
  path: tests/demo/playwright-report
  if-no-files-found: error`
- [x] 5.3 Confirm action version pinning matches the rest of the repo: `actions/upload-artifact@v7` (the existing two upload steps), no SHA pinning, 2-space YAML indent, step-key order `name → if → uses → with`, single-quoted strings where appropriate
- [x] 5.4 Run `git diff .github/` and confirm: only the new env var line and the new step were added; no changes to build/deploy/test/coverage-upload/concurrency/environment/trigger configuration; no other workflow file touched
- [x] 5.5 Walk the workflow once mentally: does the new step run after the Playwright step regardless of pass/fail (`if: always()`)? Does the `cli` job's existing `coverage-swa-node<v>` upload remain untouched? Are matrix node-versions disambiguated in the artifact name?

## 6. Tradeoff documentation in design.md

- [x] 6.1 Confirm `design.md` "Probe coverage" section states that every adapter-supported method has its own Authorization probe — `PATCH` and `DELETE` are tested directly, NOT sampled by proxy from `POST`/`PUT`
- [x] 6.2 Confirm `design.md` "Channel observability tradeoff" section states response-header pass-through is observed exclusively via `head-auth` (the HEAD probe doubles as both the auth probe for HEAD and the response-header observation), and any HEAD-decoding divergence must be resolved before interpreting other probes
- [x] 6.3 Confirm `design.md` "Local vs Azure" section preserves the distinction: local SWA CLI = supporting evidence; real Azure SWA = source of truth for #218
- [x] 6.4 Confirm `design.md` Decision 14 documents the **fail-closed Authorization scheme extraction** rule — strict regex `^[A-Za-z][A-Za-z0-9+\-.]{0,15}\s+\S`, no substring fallback for malformed values

## 7. Verification

- [x] 7.1 Run `npm run test:swa --prefix tests/demo` locally; confirm all ten probes pass and produce attachments in `tests/demo/playwright-report`
- [x] 7.2 Open the HTML report (`npx playwright show-report tests/demo/playwright-report`) and verify each of the ten `diagnostic-headers/<probe-key>.json` attachments is present, contains valid JSON with the full `DiagnosticFacts` field set, and contains NO occurrence of any test-generated bearer or probe id (string-search the attachment contents)
- [x] 7.3 Verify the `head-auth` probe retrieved facts from `x-diag-*` response headers (sanity: `curl -sI http://localhost:4280/diagnostic-headers` should show the full set, none of which carry raw values), and that no non-HEAD probe response carries an `x-diag-*` header (sanity: `curl -sI -X POST http://localhost:4280/diagnostic-headers` should not)
- [x] 7.4 Verify `Authorization` outcome classification appears in test annotations / report for all seven auth probes — `get-auth`, `head-auth`, `post-auth-form`, `put-auth-json`, `patch-auth-json`, `delete-auth`, `options-auth`
- [x] 7.5 Verify the unit test from task 1.9 covers the fail-closed scheme rule with cases: `Bearer abc` → `"bearer"`, `Basic …` → `"basic"`, `SECRET_WITHOUT_SCHEME` → `null`, `Bearer ` (trailing space, no credential) → `null`, `   Bearer abc` (leading whitespace) → `null`, `MyVeryLongCustomSchemeName abc` (>16 chars) → `null`, `Foo:bar abc` (`:` outside scheme alphabet) → `null`, header absent → `null`
- [x] 7.6 Run `git diff src/` and confirm the diff is empty (no adapter source changes)
- [x] 7.7 Run `git diff .github/` and confirm only the two additions in `.github/workflows/ci-swa.yml` from section 5 are present
- [x] 7.8 Run `npm run lint` and `npm run check` (or repo equivalents) and resolve any new findings
- [x] 7.9 Run `openspec validate forwarded-headers-diagnostics --strict` and resolve any reported issues
- [x] 7.10 After pushing the PR, watch the `swa / azure (<node-version>)` job in the CI workflow; confirm the new `playwright-report-azure-node<v>` artifact appears on the run summary page and contains the ten diagnostic attachments captured against the deployed Azure SWA URL; download one and grep for the diagnostic bearer prefix to confirm it's absent

## Why

Issue [#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218) and upstream [geoffrich/svelte-adapter-azure-swa#212](https://github.com/geoffrich/svelte-adapter-azure-swa/issues/212) describe an Azure Static Web Apps behavior the adapter has to decide a policy for: SWA appears to inject (or overwrite) the `Authorization` header on the path between the SWA edge and the managed Function, and the inbound `host` / `x-forwarded-*` headers don't necessarily reflect the public URL the user contacted.

Before we commit to a fix — strip the injected `Authorization`? rename it? prefer client-supplied? add an opt-in option? trust `x-ms-original-url` for `host`? — we need empirical evidence of what actually happens on the wire, across all adapter-supported HTTP methods, both on the local SWA CLI emulator and on a real Azure deployment. **This change is the evidence-gathering step. It does not yet implement the policy.**

The previous draft of this proposal exposed a raw header echo route. That is unsafe for a publicly-reachable demo: any caller could send a real bearer or session cookie and have it echoed back. This revision replaces the raw echo with a **safe-by-design diagnostic probe** that returns only sanitized booleans/classifications computed server-side — never the raw values themselves — so the route is safe to leave deployed in the demo.

## What Changes

- Add a SvelteKit `+server.ts` route in the demo app at `/diagnostic-headers` that handles **all seven adapter-supported methods** — `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — registered at [src/server/entry/entry.js:28](src/server/entry/entry.js#L28). All seven delegate to a shared `diagnose(event)` helper that computes a single internal diagnostic-fact object and serializes it according to method semantics.

- The diagnostic-fact object exposes **only sanitized facts** computed server-side. It MUST NOT include any raw header value, raw cookie, raw principal, raw token, or full URL/query string. Its fields:
  - **Method / URL classification (non-secret):** `method`, `requestUrlProtocol`, `requestUrlHostKind ∈ {"public", "internal-azure-functions", "localhost", "unknown"}`, `requestUrlPathname`.
  - **Authorization comparator:** `authorizationPresent`, `testAuthorizationPresent`, `authorizationScheme`, `testAuthorizationScheme`, `authorizationLooksBearer`, `testAuthorizationLooksBearer`, `authorizationEqualsTestAuthorization` (`null` if either side missing). The two values are compared **server-side using a constant-time string compare** to avoid timing leaks; only the boolean is returned. **Scheme extraction fails closed** (Decision 14): `scheme` is set only when the header value matches the strict pattern `^[A-Za-z][A-Za-z0-9+\-.]{0,15}\s+\S` — i.e. a normal token followed by whitespace and at least one credential byte; the matched token is lowercased and returned. Otherwise (no whitespace, leading whitespace, empty, single token without credential, or `null` header) the scheme is `null`. Malformed `Authorization`-like values (e.g. `SECRET_WITHOUT_SCHEME`) MUST NOT yield a scheme — no substring of the raw value is ever returned.
  - **Probe-id comparator:** `testProbeIdPresent`, `testProbeIdMatchesExpected` (`null` if `x-test-probe-id` or the expected value are missing). The expected value is supplied by the test in a second non-sensitive header `x-test-expected-probe-id`. The endpoint compares them server-side and returns only the boolean.
  - **Forwarded/host classification:** `hostPresent`, `hostLooksInternalAzureFunctionsHost`, `xMsOriginalUrlPresent`, `xMsOriginalUrlLooksAbsolute`, `xMsOriginalUrlHostEqualsUrlHost` (`null` if not comparable), `xForwardedHostPresent`, `xForwardedProtoPresent`, `xForwardedForPresent`, `xMsClientPrincipalPresent`.
  - **Run identification (non-secret):** ISO-8601 `timestamp`, server-generated `requestId` (`crypto.randomUUID()`).

- Per-method delivery:
  - `HEAD` → no body. Each fact is delivered as a separate compact response header named `x-diag-<kebab-case-key>` (e.g. `x-diag-authorization-present: true`, `x-diag-request-url-host-kind: public`). Values are boolean (`"true"`/`"false"`/`"null"`) or short string classifications. No header carries a raw secret.
  - `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`OPTIONS` → JSON body containing the same diagnostic-fact object, `Content-Type: application/json`. These methods MUST NOT set `x-diag-*` response headers.

- Add a Playwright e2e probe at `tests/demo/e2e/diagnostic-headers.test.ts` that uses Playwright's `request` fixture (browser navigation cannot send custom `Authorization` or arbitrary methods like `HEAD`/`PUT`). The **core matrix is one auth probe per adapter-supported method — seven probes, one for each of `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`**. Each of the seven generates fresh per-run values and sends:
  - `Authorization: Bearer <diagnosticBearer>`
  - `x-test-authorization: Bearer <diagnosticBearer>` (same value)
  - `x-test-probe-id: <probeId>`
  - `x-test-expected-probe-id: <probeId>`

  Each probe asserts: HTTP status equals 200; the diagnostic facts decode successfully via the channel appropriate to the method (JSON body for non-HEAD; `x-diag-*` response headers for HEAD); `method` in the facts equals the requested method; `authorizationPresent`, `testAuthorizationPresent`, `authorizationEqualsTestAuthorization`, and `testProbeIdPresent` are present in the decoded facts; the serialized fact attachment contains neither `diagnosticBearer` nor `probeId` (string-search guard).

  **Additional probes** (kept for forwarded-header coverage, but they do not replace the per-method auth probes above):
  - `get-baseline-no-auth` — `GET` without client `Authorization`, controls only — establishes the no-auth baseline for navigationFallback and lets us tell "stripped" apart from "preserved" without the test's own bearer in play.
  - `get-baseline-no-auth-repeat` — same as above, separate test, fresh values — detects whether SWA's own injected `Authorization` (if any) is stable across requests.
  - `get-spoof-forwarded` — `GET` + controls + `X-Forwarded-Host: evil.example` + `X-Forwarded-Proto: gopher` — surfaces whether the spoofing surface reaches the function.

  The test attaches **only the sanitized diagnostic-fact object** to the Playwright report via `testInfo.attach`. The test MUST NOT log, attach, or otherwise persist `diagnosticBearer`, `probeId`, raw request headers, or raw response headers. For the seven auth probes, the test additionally classifies the Authorization outcome into one of four documented buckets (preserved / overwritten / stripped / custom-headers-not-reaching-app) using the comparator booleans, and reports that classification per method via `testInfo.annotations`. **`PATCH` and `DELETE` are tested directly — not sampled by proxy from `POST`/`PUT`.**

- Add a runbook section to `tests/demo/AGENTS.md` (or `tests/demo/README.md` if more appropriate): purpose, how to run locally with `npm run test:swa --prefix tests/demo`, how to retrieve results from the deployed environment via the `swa / azure (<node-version>)` job in the **CI** workflow (which delegates to the reusable **CI-SWA** workflow at [.github/workflows/ci-swa.yml](.github/workflows/ci-swa.yml)), the explicit distinction between local SWA CLI emulator results and real Azure SWA results (real Azure is the source of truth for issue #218), and the reminder to paste the captured fact JSON into issue #218 before designing the follow-up policy change.

- Add one `actions/upload-artifact@v7` step to the `azure` job in [.github/workflows/ci-swa.yml](.github/workflows/ci-swa.yml), matching the repository's existing upload-artifact convention (see Decision 12 in design.md). The artifact contains only `tests/demo/playwright-report` — i.e. the sanitized fact attachments. Raw headers/cookies/principals/tokens are never written to disk by the test, so cannot end up in the artifact.

Explicitly **out of scope** for this change: any modification to `src/server/entry/entry.js`, `toRequest`, adapter options, header-normalization logic, or any decision about what SWA *should* do or what the adapter should do about it. The CI hook above touches `.github/`, not `src/`, and is the minimum needed for the runbook procedure to work. This change adds a **safe-by-design diagnostic surface** only.

## Capabilities

### New Capabilities
- `demo-diagnostics`: A safe-by-design diagnostic probe exposed by the demo app for empirically observing how Azure Static Web Apps forwards `Authorization` and forwarded/host headers to the managed Function across all adapter-supported HTTP methods. The probe never exposes raw secrets — only server-computed sanitized facts (booleans, host-kind classifications, scheme tokens). Covers the route contract (per-method delivery channel), the dual-`Authorization` server-side comparator, and the Playwright probe matrix that exercises both SWA routing paths against both the local SWA CLI emulator and a real Azure deployment.

### Modified Capabilities
<!-- None. Adapter behavior is unchanged. -->

## Impact

- **New files**: `tests/demo/src/routes/diagnostic-headers/+server.ts`, `tests/demo/e2e/diagnostic-headers.test.ts`.
- **Modified files**: `tests/demo/AGENTS.md` (or `tests/demo/README.md`) gains a runbook section; `.github/workflows/ci-swa.yml` gains one `actions/upload-artifact@v7` step in the `azure` job for `tests/demo/playwright-report`, in the existing repo style (named step, `if: always()`, `if-no-files-found: error`).
- **No changes** to `src/` adapter code, adapter options, or `toRequest` semantics.
- **No new runtime dependencies**. Uses Playwright's existing `request` fixture, SvelteKit's existing `RequestHandler` API, and Node's built-in `crypto`.
- **CI**: Adds one Playwright test file to the existing demo e2e suite (run via `npm test --prefix ./tests/demo` in the `azure` job) and one artifact-upload step. Probes assert only on sanitized facts, so they should not flake on header-content variation.
- **Safety posture**: The route is safe to leave deployed permanently in the demo because raw secrets are never emitted. A caller sending a real bearer through `Authorization` will only learn back the boolean/scheme classification of what they sent — nothing they didn't already know.
- **Open question for design phase**: Should the `/diagnostic-headers` route be permanently exposed in the demo, or gated behind an env flag? Default recommendation: permanently exposed — the route is safe-by-design (no raw secrets ever emitted), the demo has no public users, and we want to re-run diagnostics at any time without a redeploy.
- **Follow-up (separate change, informed by this evidence)**: depending on what the captured facts reveal, normalize `host` / `X-Forwarded-Host` / `X-Forwarded-Proto` in `toRequest`; decide handling of injected `Authorization` (preserve / strip / rename / opt-in option); extract `toRequest` into its own module with unit tests.

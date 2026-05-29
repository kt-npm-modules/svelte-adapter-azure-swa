## Context

The svelte-adapter-azure-swa adapter wraps a SvelteKit app in an Azure Functions handler so that Azure Static Web Apps' managed Function can serve SvelteKit's SSR endpoints. The adapter's `toRequest` helper translates the inbound `HttpRequest` (from `@azure/functions`) into a Web `Request` for SvelteKit.

Two open issues — [kt-npm-modules/svelte-adapter-azure-swa#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218) and the upstream [geoffrich/svelte-adapter-azure-swa#212](https://github.com/geoffrich/svelte-adapter-azure-swa/issues/212) — call out that:

- SWA appears to inject (or overwrite) an `Authorization` header on the path between the SWA edge and the managed Function.
- The `host` / forwarded headers inside the function may not reflect the public URL the user contacted.
- Behavior may differ between the local SWA CLI emulator and a real Azure deployment, and across the two SWA routing paths (explicit rewrite for `POST`/`PUT`/`DELETE`/`PATCH` to `/api/sk_render` at [src/swa-config/index.js:49](src/swa-config/index.js#L49); `navigationFallback` for `GET`/`HEAD`/`OPTIONS`).

The adapter registers all seven methods at [src/server/entry/entry.js:28](src/server/entry/entry.js#L28).

The follow-up change will decide a policy (preserve / strip / rename / opt-in for `Authorization`; trust `x-ms-original-url` for `host` or not). Designing that policy without empirical evidence is guesswork — and the wrong policy here is security-adjacent (auth-token collision, host-header spoofing).

This change is the evidence-gathering step that precedes that policy decision. **The previous draft of this design used a raw header echo route, which would expose any caller-supplied `Authorization` / `Cookie` / `x-ms-client-principal` back over the network — unsafe for a publicly-reachable demo.** This revision replaces that with a probe that returns only **sanitized facts computed server-side** — booleans, scheme tokens, host-kind classifications — so the route is safe to leave deployed.

## Goals / Non-Goals

**Goals:**

- Capture enough sanitized empirical evidence about how SWA forwards `Authorization` and forwarded/host headers to drive the follow-up policy decision (preserve vs strip vs rename vs opt-in for `Authorization`; what to trust for `host`).
- Cover **all seven adapter-supported HTTP methods** (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`) and both SWA routing paths.
- Detect, via a server-side comparator of `Authorization` against a parallel client-supplied `x-test-authorization`, the four observable Authorization outcomes: **preserved**, **overwritten**, **stripped**, and **custom-headers-not-reaching-the-app**.
- Run the same probe matrix identically against the local `swa start` emulator and against a deployed Azure SWA, and **preserve the distinction in the runbook** — real Azure is the source of truth for issue #218; local CLI is supporting evidence.
- Make the captured data trivially recoverable from a CI run (Playwright report attachment containing only sanitized facts).
- Be safe-by-design for a public/demo environment: never emit a raw `Authorization`, raw `Cookie`, raw `x-ms-client-principal`, raw token, full URL/query, or arbitrary unknown header value.

**Non-Goals:**

- No changes to adapter source under `src/`. No edits to `src/server/entry/entry.js`, `toRequest`, or any adapter normalization behavior.
- No new adapter options. No `testWorkarounds` switches. No env-controlled adapter behavior.
- No header-normalization logic. No decision about what SWA *should* do or what the adapter *should* do about it.
- No raw-header observability. The previous draft's raw `request.headers` dump is explicitly removed; if a fact we later need isn't on the diagnostic-fact object, the follow-up change adds it as another sanitized field rather than re-introducing raw exposure.
- Not a permanent test gate. The probe asserts only HTTP 200 + sanitized fact shape; it is a diagnostic capture, not a regression test.

## Decisions

### Decision 1: Echo route lives under SvelteKit, not in `func/`

The probe lives at `tests/demo/src/routes/diagnostic-headers/+server.ts` as a SvelteKit endpoint. Reason: this gives us the post-`toRequest` view — exactly the input that adapter-rendered SvelteKit endpoints receive — which is what the upcoming policy change will operate on. An `api/` Function-Apps endpoint under `tests/demo/func/` would observe the *pre*-`toRequest` view and miss anything `toRequest` introduces or strips.

**Alternatives considered:** placing the probe under `tests/demo/func/api/` — rejected because it sees the wrong layer. We could add both, but a second probe doubles maintenance for a one-shot evidence-gathering step.

### Decision 2: All seven adapter-supported methods

The route exports `RequestHandler`s for `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS` — every method registered at [src/server/entry/entry.js:28](src/server/entry/entry.js#L28). All seven delegate to a shared `diagnose(event)` helper. Reason: SWA splits routing across two edge paths and we don't yet know whether method coverage within each path is uniform. Excluding any method risks needing to re-open this change later if a bug surfaces on a method we didn't probe. Cost is trivial (one helper + seven one-line exports).

The acceptance criterion is that no method returns 405 and every method's `method` field in the diagnostic-fact object echoes the request method correctly.

### Decision 3: Sanitized facts only — never raw values (security-critical)

The diagnose helper builds a single internal `DiagnosticFacts` object and emits it. The object contains **only** these field categories:

- **Booleans** indicating presence/absence/equality of inputs.
- **Short string classifications** drawn from a closed enum (e.g. `requestUrlHostKind ∈ {"public","internal-azure-functions","localhost","unknown"}`).
- **Scheme tokens** for `Authorization` and `x-test-authorization`, computed by the **fail-closed** rule defined in Decision 14. Schemes are non-secret by definition (Bearer/Basic/Digest/etc.); the rule guarantees no substring of a malformed Authorization-like value (e.g. `SECRET_WITHOUT_SCHEME`) is ever returned.
- **Non-secret run identifiers** — ISO-8601 `timestamp`, server-generated `requestId` (`crypto.randomUUID()`).
- **Echo of method and limited URL parts** — `method`, `requestUrlProtocol`, `requestUrlPathname`. The URL **host is never echoed verbatim**; instead we emit `requestUrlHostKind` from the closed enum above. The URL **query string and any fragment are never echoed**.

The object MUST NOT contain: any raw `Authorization` value or substring beyond the scheme; raw `x-test-authorization` value; raw `Cookie`; raw `x-ms-client-principal`; raw token; any other arbitrary unknown header value; any full URL with host/query.

**Why this is safer than the prior draft:** any caller — including an attacker probing the deployed demo — only learns back booleans/classifications about inputs *they themselves sent*. They learn nothing they didn't already know.

**Alternatives considered:** denylist on a raw echo (e.g. "echo all headers except `Authorization`/`Cookie`") — rejected. Denylists fail open: any new sensitive header SWA introduces (e.g. `x-ms-token-aad-id-token`, `x-ms-client-principal-name`) leaks until someone notices and patches the list. An allowlist of sanitized facts fails closed.

### Decision 4: Authorization comparator — dual header, server-side, constant-time

Tests send the same value in two headers:

- `Authorization: Bearer <diagnosticBearer>` — the channel SWA may rewrite/inject/strip.
- `x-test-authorization: Bearer <diagnosticBearer>` — a parallel channel SWA is presumed not to touch (because it has no documented meaning to the SWA edge), used as a control.

The diagnose helper:

1. Reads both header values.
2. Computes `authorizationPresent`, `testAuthorizationPresent`, `authorizationScheme`, `testAuthorizationScheme`, `authorizationLooksBearer`, `testAuthorizationLooksBearer`.
3. If both are present, computes `authorizationEqualsTestAuthorization` using `crypto.timingSafeEqual` on UTF-8-encoded buffers of equal length (compare lengths first; if unequal, the answer is `false` without further work). If either header is missing the field is `null`.

The four observable outcomes follow directly:

| Outcome | `authorizationPresent` | `testAuthorizationPresent` | `authorizationEqualsTestAuthorization` |
|---|---|---|---|
| **Preserved** (SWA passes client `Authorization` through) | `true` | `true` | `true` |
| **Overwritten / injected** (SWA replaces client `Authorization`) | `true` | `true` | `false` |
| **Stripped** (SWA removes `Authorization` entirely) | `false` | `true` | `null` |
| **Custom headers not reaching app** (`x-test-authorization` filtered out) | (any) | `false` | `null` |

This is the core empirical question for the policy decision.

**Why constant-time compare:** even though `diagnosticBearer` is freshly generated per run and not a real credential, leaking timing information about user-supplied bearers would be a footgun if the demo is later repointed at real auth.

**Alternatives considered:** comparing only schemes — rejected, doesn't distinguish "preserved" from "overwritten with another Bearer". Comparing hashes — rejected, no benefit over constant-time direct compare for fixed-size inputs.

### Decision 5: Probe-id comparator — paired control header

Tests additionally send:

- `x-test-probe-id: <probeId>` — the value the test wants to see arrive.
- `x-test-expected-probe-id: <probeId>` — the same value, on a separate header, as the authoritative expected value the server can compare against.

The diagnose helper computes `testProbeIdPresent` and `testProbeIdMatchesExpected` (`null` if either is absent), again via constant-time compare. Neither raw value is returned.

**Why two headers carrying the same value:** the server has no other way to know what the test expected; pinning the expectation in the request lets the server emit a boolean rather than the raw id. The test treats the boolean as the answer.

**Why this is non-secret:** `probeId` is a freshly-generated UUID per run, not used elsewhere. The booleans don't reveal anything an attacker couldn't compute themselves by sending `x-test-probe-id: foo` and `x-test-expected-probe-id: foo`.

**Alternatives considered:** returning the raw `x-test-probe-id` value with a `safe: true` annotation — rejected, drives toward a "raw echo with allowlist" mindset which is exactly what this revision moves away from. Hashing the probe id into the response — rejected, adds noise without benefit; the boolean is sufficient.

### Decision 6: Forwarded/host classification fields

For each of the proxy-relevant headers, the helper emits only a presence boolean and (where useful) a coarse classification — never the raw value:

- `hostPresent`, `hostLooksInternalAzureFunctionsHost` (regex: ends in `.azurewebsites.net` after stripping port — full host never returned).
- `xMsOriginalUrlPresent`, `xMsOriginalUrlLooksAbsolute` (starts with `http://` or `https://`), `xMsOriginalUrlHostEqualsUrlHost` (compare the host extracted from `x-ms-original-url` against the host extracted from `event.url` — emit only the boolean; if either side fails to parse, `null`).
- `xForwardedHostPresent`, `xForwardedProtoPresent`, `xForwardedForPresent`.
- `xMsClientPrincipalPresent`.

These fields are exactly enough to answer the questions issue #218 raises ("does the inbound `host` look like the public URL or the internal Function host? does `x-ms-original-url` carry the public URL? do `x-forwarded-*` reach the function?") without emitting the values.

**Alternatives considered:** echoing the host *value* on the assumption it's non-secret — rejected. The internal `<guid>.azurewebsites.net` host kind is non-secret in form (it's well-known SWA infra) but the specific `<guid>` is the customer's deployment id and not something we should hand back to arbitrary callers. The `hostKind` enum captures the part we need.

### Decision 7: Single channel per method, dictated by HTTP semantics

The helper branches on `event.request.method` and serializes the same internal `DiagnosticFacts` two ways:

- **`HEAD`** → no body (RFC 9110 §9.3.2). Each fact rides as a separate compact response header named `x-diag-<kebab-case-key>`. Boolean values are encoded as `"true"`, `"false"`, or `"null"`. String classification values are short (max ~32 chars) and from the closed enum. Server-generated values (`requestId`, `timestamp`) are also emitted as `x-diag-*`. Header bytes per fact are bounded (longest is `requestId` at 36 chars) so total response-header size stays well under any reasonable proxy limit.
- **`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`** → JSON body with `Content-Type: application/json`. These methods MUST NOT set `x-diag-*` response headers.

The header-name prefix is `x-diag-` (not `x-ms-*`, which is reserved by SWA and may be filtered by the edge).

**Alternatives considered:** dual-channel delivery (always set both body and `x-diag-*` headers) — rejected, adds reconciliation noise and obscures whether a probe is observing the body channel or the header channel. Always-body — rejected, would violate RFC 9110 for HEAD.

### Decision 8: Probe matrix — one Authorization probe per adapter-supported method, plus three forwarded-header probes

The core matrix is **seven Authorization probes — one per adapter-supported method**. `PATCH` and `DELETE` are tested **directly**, not sampled by proxy from `POST`/`PUT`. Three additional non-auth `GET` probes cover the no-auth baseline (so we can tell "stripped" from "preserved" without the test's own bearer in play), inject-stability across requests, and the `X-Forwarded-*` spoofing surface.

Every probe generates fresh per-run `diagnosticBearer` and `probeId`. "Controls" in the table below means `x-test-authorization: Bearer <diagnosticBearer>`, `x-test-probe-id: <probeId>`, `x-test-expected-probe-id: <probeId>` — the same three control headers on every probe. Probes that send `Authorization` send the same `Bearer <diagnosticBearer>` value as `x-test-authorization`.

**Auth probes — one per method:**

| # | Probe key | Method | Extra request headers | Body | Routing path |
|---|---|---|---|---|---|
| 1 | `get-auth` | `GET` | `Authorization` + controls | — | navigationFallback |
| 2 | `head-auth` | `HEAD` | `Authorization` + controls | — | navigationFallback |
| 3 | `post-auth-form` | `POST` | `Authorization` + controls + `Content-Type: application/x-www-form-urlencoded` | `foo=bar` | explicit rewrite |
| 4 | `put-auth-json` | `PUT` | `Authorization` + controls + `Content-Type: application/json` | `{"foo":"bar"}` | explicit rewrite |
| 5 | `patch-auth-json` | `PATCH` | `Authorization` + controls + `Content-Type: application/json` | `{"foo":"bar"}` | explicit rewrite |
| 6 | `delete-auth` | `DELETE` | `Authorization` + controls | — | explicit rewrite |
| 7 | `options-auth` | `OPTIONS` | `Authorization` + controls | — | navigationFallback |

**Additional forwarded-header probes (do not replace the per-method auth probes above):**

| # | Probe key | Method | Extra request headers | Body | Routing path | Purpose |
|---|---|---|---|---|---|---|
| 8  | `get-baseline-no-auth` | `GET` | controls only (no `Authorization`) | — | navigationFallback | establishes the no-auth baseline; lets us tell "stripped" from "preserved" without the test's bearer present |
| 9  | `get-baseline-no-auth-repeat` | `GET` | controls only (no `Authorization`), fresh values | — | navigationFallback | inject-stability check across two no-auth requests |
| 10 | `get-spoof-forwarded` | `GET` | controls + `X-Forwarded-Host: evil.example` + `X-Forwarded-Proto: gopher` | — | navigationFallback | surfaces whether the spoofing surface reaches the function |

The auth probes give one direct `preserved | overwritten | stripped | custom-headers-not-reaching-app` classification per HTTP method on real Azure. The HEAD probe doubles as the response-header pass-through observation (see "Channel observability tradeoff" below) — since `head-auth` already exercises the auth path, no separate `head-baseline` is needed; if `x-diag-*` headers are mangled by the edge, the HEAD auth probe will fail to decode, which is the same finding.

### Decision 9: Test classifies outcome, asserts only on shape

The test's only hard assertions are: HTTP status equals 200; the diagnostic-fact object is retrievable from the channel appropriate to the method; `JSON.parse` (or header-decode for HEAD) produces an object with the expected field shape; `facts.method` equals the requested method; the comparator booleans `authorizationPresent`, `testAuthorizationPresent`, `authorizationEqualsTestAuthorization`, and `testProbeIdPresent` are present in the decoded facts; the serialized fact attachment contains neither `diagnosticBearer` nor `probeId` (string-search guard).

In addition, for the seven Authorization probes (one per method — `get-auth`, `head-auth`, `post-auth-form`, `put-auth-json`, `patch-auth-json`, `delete-auth`, `options-auth`), the test classifies the observed outcome into one of the four buckets from Decision 4 (preserved / overwritten / stripped / custom-headers-not-reaching-app) and reports the classification per method via `testInfo.annotations`. **The classification is not asserted to be a specific value** — we don't yet know the right answer. It is reported so a maintainer reading the report immediately sees, for each method on each environment, "Azure: stripped; local SWA CLI: preserved" without parsing JSON.

The test MUST NOT log, attach, or otherwise persist `diagnosticBearer`, `probeId`, raw request headers, or raw response headers. It MUST attach only the sanitized fact object and the derived classification string.

### Decision 10: Playwright `request` fixture, not `page.goto`

All ten probes go through Playwright's `APIRequestContext`. Reason: browser navigation cannot attach a custom `Authorization` header, can't issue arbitrary methods like `HEAD`/`PUT`/`PATCH`/`DELETE`, and adds its own forbidden-header sanitization on top.

### Decision 11: `testInfo.attach` is the canonical capture mechanism

Each probe attaches its retrieved fact object to the Playwright report via `testInfo.attach('diagnostic-headers/<probe-key>.json', { body: <stringified JSON of the sanitized DiagnosticFacts only>, contentType: 'application/json' })`. Attachments contain only sanitized facts — never `diagnosticBearer`, `probeId`, raw request headers, raw response headers, or any full URL. The Playwright HTML report is already produced by the existing demo e2e setup.

### Decision 12: CI-SWA `azure` job uploads `playwright-report` as an artifact

The `azure` job in `.github/workflows/ci-swa.yml` does not currently upload Playwright output — only coverage. Without an artifact-upload step, the facts captured against the deployed Azure SWA are reachable only through GitHub Actions log scrollback, which is unworkable for pasting into issue #218.

This change adds one `actions/upload-artifact@v7` step at the end of the `azure` job, **matching the repository's existing convention**:

- Pinned to `actions/upload-artifact@v7` (the version used by both existing upload steps in `ci-swa.yml` and `ci.yml`).
- Has a `name:` field, follows step-key order `name` → `if` → `uses` → `with`.
- `if: always()` so the artifact is produced even when a probe fails.
- `if-no-files-found: error` (matches existing style).
- Artifact name disambiguated across the node-version matrix via the existing `${{ env.... }}` pattern, e.g. setting a job-level `env.PLAYWRIGHT_REPORT_DIR: tests/demo/playwright-report` and `env.PLAYWRIGHT_REPORT_NAME: playwright-report-azure-node${{ matrix.node-version }}`.
- 2-space YAML indent, single-quoted strings where appropriate.
- No SHA pinning (the repo uses floating tags everywhere).

This is a pure CI-config addition (no `src/` changes) and **the only modification this change makes outside `tests/demo/`**. The artifact contains only sanitized fact attachments, since the test itself never writes raw secrets.

**Alternatives considered:** uploading from a manual `workflow_dispatch` — rejected because the diagnostic data should ride along with the same PR mechanism the team already uses; piping the JSON into a PR comment from inside the test — rejected as a layering violation.

**Explicitly not done:** the `azure` job's other steps (deploy, test, env, concurrency, environment) are untouched. No general workflow modernization. Any unrelated style nits stay out.

### Decision 13: Documentation lives in `tests/demo/AGENTS.md`

The runbook section is added to `tests/demo/AGENTS.md` (which already exists). Reason: this is an operational note targeted at maintainers and agents, not at first-time users of the demo; `AGENTS.md` is the existing home for that genre. The runbook MUST explicitly preserve the local-vs-Azure distinction (see "Local vs Azure" below).

### Decision 14: Authorization scheme extraction fails closed

The scheme tokens emitted as `authorizationScheme` and `testAuthorizationScheme` MUST be derived by a strict regex match — not by "split on first whitespace and take the first piece". A header value `v` yields a non-`null` scheme **only if all of these hold**:

- `v` matches the regex `^[A-Za-z][A-Za-z0-9+\-.]{0,15}\s+\S` (case-insensitive on the leading token, anchored to start, requires whitespace, requires at least one credential byte after the whitespace).
- The captured token (group 1) has length 1–16.

When matched, the helper emits the lowercased captured token. When unmatched (no whitespace, leading whitespace, empty value, single token without credential, header absent, or header containing characters outside the allowed alphabet for the scheme name), the helper emits `null`.

This rule applies identically to `Authorization` and `x-test-authorization`.

**Why fail-closed:** the prior "substring before the first whitespace, max 16 chars" rule would happily turn `SECRET_WITHOUT_SCHEME` into the scheme token `secret_without_s` — a 16-character substring of a sensitive value, returned to the caller. That defeats the safe-by-design posture of the route. The strict regex guarantees the only header values that produce a scheme are ones that actually look like RFC 9110 §11.1 challenge tokens (Bearer/Basic/Digest/etc.), where the scheme name itself is non-secret by definition. Anything else — including malformed Authorization-like values, raw tokens, opaque session blobs — produces `null`.

**Examples (test these in the unit test for the diagnose helper):**

| Header value | Emitted scheme |
|---|---|
| `Bearer abc.def.ghi` | `"bearer"` |
| `Basic dXNlcjpwYXNz` | `"basic"` |
| `bearer abc` | `"bearer"` |
| `Digest username="…"` | `"digest"` |
| `SECRET_WITHOUT_SCHEME` | `null` (no whitespace) |
| `Bearer ` (trailing space, no credential) | `null` (regex requires `\S` after whitespace) |
| `   Bearer abc` (leading whitespace) | `null` (anchored to start) |
| `MyVeryLongCustomSchemeName abc` | `null` (token longer than 16 chars) |
| `Foo:bar abc` (`:` is not in the allowed scheme alphabet) | `null` |
| `null` / absent header | `null` |

**Alternatives considered:** stop at any whitespace and emit whatever was before — rejected, leaks substrings of malformed values. Hash the value and emit the hash — rejected, hashes of unknown values are still observability we don't need; the boolean comparator already distinguishes preserved/overwritten without needing to inspect the value's shape.

## Local vs Azure

The probe runs against two environments and the runbook MUST explicitly distinguish them:

- **Local SWA CLI emulator** (`npm run test:swa --prefix tests/demo`, `PUBLIC_SWA_CLI=true` branch of [tests/demo/playwright.config.ts](tests/demo/playwright.config.ts), baseURL `http://localhost:4280`). This runs the SWA CLI on the developer's machine and is useful for fast iteration, but the SWA CLI is a Node.js reimplementation of the SWA edge — its behavior on `Authorization` injection, `host` rewriting, and `x-ms-*` header generation **need not match real Azure**.
- **Real Azure SWA** (PR-triggered `swa / azure (<node-version>)` job in the **CI** workflow, which delegates to **CI-SWA** at `.github/workflows/ci-swa.yml`; runs Playwright against `steps.build-deploy.outputs.static_web_app_url`). This is the source of truth for issue #218.

Both sets of fact JSON must be pasted into issue #218; if they disagree, real Azure wins for the policy decision.

## Probe coverage

The probe matrix tests every adapter-supported method directly:

- **One Authorization probe per method** — `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` (auth probes 1–7). Each runs the full comparator and produces a per-method `preserved | overwritten | stripped | custom-headers-not-reaching-app` classification on each environment. **`PATCH` and `DELETE` are tested directly — not sampled by proxy from `POST`/`PUT`.**
- **Three additional `GET` probes** for forwarded-header concerns: a no-auth baseline, a no-auth baseline repeat (inject-stability), and an `X-Forwarded-*` spoofing probe. The spoofing probe is only run on `GET` because if the headers reach the function on any method, that's a concern for the whole adapter — it's not method-specific in the way `Authorization` handling is.

This is direct coverage of every method on the `Authorization` axis. Bodies are kept minimal (`foo=bar` form for `POST`, `{"foo":"bar"}` JSON for `PUT`/`PATCH`) — the question being asked is about headers, not body parsing.

## Channel observability tradeoff

Single-channel-per-method delivery (Decision 7) means the question "does the SWA edge mangle response headers?" is observed exclusively through the `HEAD` probe (which is also the `head-auth` probe — there is no separate baseline-only HEAD).

- If `head-auth` returns 200 with the full set of `x-diag-*` headers intact and decodable, response-header pass-through is confirmed for the whole matrix.
- If `head-auth` loses any `x-diag-*` (header missing, header value mangled, header renamed by the edge), that finding takes precedence: it must be resolved or scope-bounded before interpreting other probes' fact objects, because we no longer know whether response headers we set on the SvelteKit side traverse the edge intact.

Per-fact `x-diag-*` headers are bounded in size (longest is `requestId` at 36 chars), so the total response-header size for the HEAD probe is well under any reasonable proxy limit. If a future probe needs many more facts on HEAD, the encoding may need revisiting (combine into one `x-diag-summary: <compact-encoding>` header, or move HEAD to body delivery via a workaround). Out of scope for this change.

## Risks / Trade-offs

- **[Risk]** A future maintainer copy-pastes the demo into a public app and inherits the route. → **Mitigation:** the route is now safe-by-design (no raw values ever emitted), so the worst case is the route exists in someone's app and reports booleans about their own caller's headers — which an attacker could compute themselves anyway. The runbook still documents this so a security-conscious maintainer can remove the route if their threat model demands it.
- **[Risk]** The probe asserting only 200 + fact-shape could mask a regression that breaks the route entirely, but only if someone wires it into a required CI gate. → **Mitigation:** treat the probe as a diagnostic, not a gate; do not block PRs on its outcome.
- **[Risk]** SWA's `Authorization` injection (if any) might encode caller identity, which the comparator booleans would partially expose by indicating "overwritten" vs "preserved" depending on whether the caller is the same identity SWA injects. → Accepted: the boolean reveals only the equality with the test's own freshly-generated bearer; no information about the injected identity itself leaks. This is exactly the data point we need.
- **[Trade-off]** No flag means the route ships in any preview/staging the demo is deployed to. → Accepted: the route is safe-by-design.
- **[Trade-off]** Server-side classification means we lose the ability to discover unanticipated header behaviors that aren't on the fact list. → Accepted: that's the price of safety. If the captured facts turn out to be insufficient for the follow-up policy change, the next iteration of the probe adds another sanitized field — it does not re-introduce raw exposure.
- **[Trade-off]** `HEAD`-only response-header observation means a partial header-mangle (e.g., edge strips only headers above some threshold) could be invisible if our `x-diag-*` headers are below it. → Accepted: out of scope; revisit if the follow-up policy needs robust response-header observation.

## Migration Plan

Not applicable — this change adds new files and one CI step only, and doesn't modify existing behavior. Rollback is `git revert` of the change commit; no data migration, no flag flip, no downstream coordination.

The intended sequencing is:

1. Land this change in a feature branch.
2. Run the probe locally against `swa start` via `npm run test:swa --prefix tests/demo`.
3. Push the branch and open a PR against `main`. The `swa / azure (<node-version>)` job in CI runs the probe against the deployed Azure SWA preview URL.
4. Download the `playwright-report-azure-node<v>` artifact added by Decision 12 and read off the ten fact JSONs and their classifications.
5. Paste both local and Azure fact sets into issue #218, side by side, with the four-bucket Authorization classification per probe.
6. Open the follow-up OpenSpec change for adapter Authorization / forwarded-header policy, citing the captured evidence.

## Open Questions

None remaining. (Closed in this revision: deployed-environment access — confirmed via `swa / azure` in CI-SWA, with artifact upload added in Decision 12 in repo style; `testInfo.attach` name collisions — non-issue, each Playwright run produces its own report and probe keys are unique within a run; `PUT`/`PATCH`/`DELETE` uniformity — already documented under "Probe coverage tradeoff"; raw-header safety — closed by the sanitized-facts rewrite, route is now safe-by-design.)

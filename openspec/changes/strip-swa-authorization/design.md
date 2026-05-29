## Context

Issue [#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218) was scoped over two archived diagnostics changes ([forwarded-headers-diagnostics](../archive/2026-05-29-forwarded-headers-diagnostics/), [diagnose-swa-rewrite-vs-fallback](../archive/2026-05-29-diagnose-swa-rewrite-vs-fallback/)). The captured Playwright reports answer the empirical question: real Azure SWA sets/overwrites the inbound `Authorization` header before the request reaches the managed Function. This happens on every adapter-supported HTTP method, through both `navigationFallback` and explicit per-path `rewrite` routing, and even when the client sent no `Authorization`. The local SWA CLI emulator does not reproduce the injection, so the existing diagnostic test currently assumes a mostly preserved/stripped surface and would not have caught the live Azure behaviour without the explicit two-channel probes.

The current adapter forwards every inbound header except `x-ms-original-url` into the SvelteKit `Request` (see [src/server/entry/entry.js:126-141](src/server/entry/entry.js#L126-L141)). That includes whatever value Azure SWA chose to set for `Authorization`. SvelteKit handlers, hooks, and SSR loads then read `request.headers.get('authorization')` and treat it as if it were a client-supplied credential.

This change implements the minimal correct fix: by default, the adapter strips `Authorization` from the inbound headers before constructing the SvelteKit `Request`. An adapter option `preserveAuthorization?: boolean` provides an explicit opt-in escape hatch for consumers who genuinely want the platform-supplied value. The change is intentionally narrow — it does not touch `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `x-ms-original-url`, or any other header — so the policy decision stays bounded to the one header where the platform's behaviour is unambiguously incorrect for SvelteKit consumers.

The existing `testWorkarounds` instrumentation is the one channel that observes adapter-internal request-mutation facts via the transport header `x-adapter-test-workarounds`. It currently carries only empty-form workaround fields with a flat shape; this change refactors that payload into a typed namespaced shape so the empty-form facts and the new auth facts coexist cleanly without inventing a second transport header.

## Goals / Non-Goals

**Goals:**

- Stop forwarding the inbound `Authorization` header to SvelteKit by default, eliminating the silent platform-token exposure on real Azure SWA deployments.
- Provide an explicit `preserveAuthorization: true` escape hatch for consumers who want the previous behaviour.
- Refactor `testWorkaroundsInfo` into a typed nested shape (`emptyFormContentTypeStrip` + `auth`) on the existing single transport header `x-adapter-test-workarounds`, so the existing empty-form workaround test and the new auth workaround tests can coexist on one channel.
- Add unit coverage for the header-copy/strip behaviour and the auth diagnostics computation.
- Update the existing diagnostic-headers e2e expectations so they assert the fixed default behaviour against both local SWA CLI and real Azure SWA, using the same `PUBLIC_SWA_CLI` / `CI` environment branching the existing empty-form test already uses.
- Document the new option, its rationale, and the bearer-auth-behind-SWA caveat in the README options section.

**Non-Goals:**

- No normalization of `Host`, `X-Forwarded-Host`, or `X-Forwarded-Proto`. The diagnostic evidence around forwarded headers is captured but unaddressed by this change; a separate change can revisit it.
- No change to `x-ms-original-url` handling. The adapter continues to consume it for `Request.url` construction and continues to filter it from the downstream `Request.headers`.
- No new diagnostic routes. The existing `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite` routes are reused.
- No move of `Authorization` to `x-ms-swa-authorization` or any other header.
- No public API change beyond `preserveAuthorization?: boolean`.
- No CI workflow modification unless strictly required.
- No change to the `diagnose` helper or its unit test in `tests/demo/src/lib/`. The expected fact values shift because the adapter strips earlier; the helper itself is unchanged.
- No removal or redesign of the existing diagnostic-headers routes; only their expected values change after the fix. `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite` remain in place with unchanged shape, and the route-mode matrix and attachment naming (`nav-fallback/<probe-key>.json`, `rewrite/<probe-key>.json`) are unchanged.
- No normalization of `Host` / `X-Forwarded-Host` / `X-Forwarded-Proto`. No change to `x-ms-original-url` behaviour. No move of `Authorization` to `x-ms-swa-authorization`. No new diagnostic routes. No GitHub Actions workflow changes unless strictly required. No public API beyond `preserveAuthorization?: boolean`.

## Decisions

### Decision 1: Strip-by-default with an explicit opt-in escape hatch

`preserveAuthorization` defaults to `false`. The adapter strips the inbound `Authorization` header before constructing the SvelteKit `Request`. Consumers who want the previous behaviour set `preserveAuthorization: true` in the adapter call.

This is a deliberate breaking-by-default change for the silent-exposure case, with a one-line opt-in for everyone who wants the prior surface. It mirrors what a security-minded default looks like for a platform that demonstrably injects the header.

**Alternatives considered:**

- **Default `true` and require opt-in to strip** — rejected. Today every consumer is silently exposed to a platform-injected token; defaulting to preserve keeps the broken behaviour as the default and most consumers will never know to opt in.
- **Move `Authorization` to a different header** (e.g. `x-ms-swa-authorization`) — rejected per user instruction. Renaming a header is a different kind of policy decision (it implies "the platform value is sometimes useful, just not at this name") and is out of scope here.
- **Strip only the value Azure injects, not values the client sent** — rejected. The adapter cannot reliably distinguish a client-supplied value from a platform-injected one; the diagnostic evidence shows Azure overwrites client values, not just appends. A reliable distinguisher would require trusting another header (e.g. `x-forwarded-host` shape) and that is a much larger surface than this change wants to take on.

### Decision 2: Case-insensitive `Authorization` match without relying on accidental casing

The header iteration in `entry.js` currently lowercases keys via `httpRequest.headers.forEach((value, key) => ...)`, where `@azure/functions` `HttpRequest.headers` is a `Headers`-like object that yields lowercased keys per the WHATWG spec. We do not rely on that as the spec for our skip rule. The strip check matches `key.toLowerCase() === 'authorization'`, so any future runtime behaviour that yields original-cased keys still strips correctly.

**Alternatives considered:**

- **Match `key === 'authorization'` only** — rejected, brittle: depends on the iterator emitting lowercase keys.
- **Use a `new Headers()` and call `.delete('authorization')`** — viable but requires constructing a `Headers` instance from the `@azure/functions` headers, adding one allocation. The current code already builds a plain `Record<string, string>`; extending its filter from one key to two (`x-ms-original-url`, `authorization`) is the smallest change.

### Decision 3: Wire `preserveAuthorization` through the existing build-time `ENV` module

The generated server entry already imports `debug` and `testWorkarounds` from a virtual `ENV` module (see [src/server/index.js:175-187](src/server/index.js#L175-L187) and [src/server/entry/index.d.ts](src/server/entry/index.d.ts)). The new flag follows the same pattern: `writeEnvironment` emits a third `export const preserveAuthorization = ...` line, the `ENV` module typing declares it, and `entry.js` imports it.

**Alternatives considered:**

- **Read from `process.env` at runtime** — rejected, inconsistent with how `debug` and `testWorkarounds` are wired.
- **Pass through `manifest`** — rejected, the manifest is for SvelteKit's routing data; adapter flags belong in `ENV`.

### Decision 4: One transport header, typed nested payload

Keep the single transport header `x-adapter-test-workarounds`. Replace its current loose `Record<string, any>` payload with a JSDoc typedef `AdapterTestWorkaroundsInfo` containing two optional namespaces:

```js
/**
 * @typedef {object} AdapterTestWorkaroundsInfo
 * @property {EmptyFormContentTypeStripInfo=} emptyFormContentTypeStrip
 * @property {AuthWorkaroundInfo=} auth
 */
```

Move the existing `method`, `contentType`, `contentLength`, `hasBodyObject`, `emptyPostWorkaround` fields under `emptyFormContentTypeStrip`. Add the new auth fields under `auth`. This keeps the wire format on one header and reflects the policy that adapter test workarounds are namespaced by the workaround they instrument.

**Alternatives considered:**

- **Add a separate `x-adapter-test-auth-workaround` transport header** — rejected per user instruction. Two headers fragments the test surface; one header with a typed payload is cleaner.
- **Keep the flat payload and prefix new fields with `auth*`** — rejected. The existing fields would still need to be left flat (back-compat with the `+page.server.ts` empty-form action's `JSON.parse`), which would mix two namespaces at the top level. A nested object cleanly versions both.

### Decision 5: `AuthWorkaroundInfo` field semantics — booleans + tri-state equality

`AuthWorkaroundInfo` carries:

- `rawAuthorizationPresent: boolean` — whether the inbound `httpRequest.headers` contained `authorization` BEFORE the strip step.
- `testWorkaroundAuthorizationPresent: boolean` — whether the inbound `httpRequest.headers` contained `x-test-workaround-authorization`.
- `rawAuthorizationEqualsTestWorkaroundAuthorization: boolean | null` — `true` only when both raw `Authorization` and `x-test-workaround-authorization` are present and equal; `false` only when both are present and differ; `null` when either side is missing (comparison is undefined).
- `authorizationStripped: boolean` — `true` iff the adapter actually removed the raw `Authorization` from the downstream SvelteKit `Request` (i.e. raw was present AND `preserveAuthorization === false`); `false` otherwise (including the case where raw was absent — nothing to strip).

The tri-state equality field gives tests the four distinguishable outcomes:

- `(true, true, true, true)` — local SWA CLI auth probe: client `Authorization` reached the adapter intact and was stripped.
- `(true, true, false, true)` — real Azure SWA auth probe: client `Authorization` was overwritten by Azure (so it differs from the client's `x-test-workaround-authorization`), and was then stripped.
- `(false, true, null, false)` — local SWA CLI no-auth baseline: client did not send `Authorization`, comparison undefined, nothing to strip.
- `(true, true, false, true)` — real Azure SWA no-auth baseline: client did not send `Authorization`, but Azure injected one anyway (so it differs from the client's `x-test-workaround-authorization`), then it was stripped.

These four cells are exactly what the e2e test asserts. The Local CLI baseline cell collapses to `(false, true, null, false)` precisely because the local emulator does not inject `Authorization` — the existence of that diagnostic outcome is a feature, because it is the canary that tells us if Azure ever stops injecting.

`x-test-workaround-authorization` is only a test control header. It is never read or interpreted as auth by the adapter. It exists solely so the e2e test can prove "the value Azure handed us differs from the value the test client sent" without having to expose either raw value.

**Alternatives considered:**

- **Compare raw `Authorization` against `x-test-authorization` instead of a separate `x-test-workaround-authorization`** — rejected. `x-test-authorization` is the existing comparator used by the `diagnose` helper at the SvelteKit level for its own `authorizationEqualsTestAuthorization` field; reusing it would entangle the adapter-level pre-strip comparison with the SvelteKit-level post-strip comparison. A separate test control header keeps the two layers independently observable.
- **Include the raw values in the JSON payload for stronger evidence** — rejected, would expose Azure-injected bearer tokens to the test report.

### Decision 6: No raw values in `x-adapter-test-workarounds.auth`

The auth payload contains only booleans and a tri-state. No raw `Authorization` value, no raw `x-test-workaround-authorization` value, no Azure bearer token, no scheme prefix is ever copied into the JSON. This is the same safety posture the existing `diagnose` helper applies at the SvelteKit level; we apply it to the adapter-internal channel for consistency and because attachments may be persisted to CI artifacts.

### Decision 7: Compute auth info BEFORE the strip step

Inside `entry.js`, the auth-info computation runs at the top of the request handler when `testWorkarounds` is `true`, before `toRequest`. That way `rawAuthorizationPresent` reflects the inbound state, not the post-strip state. `authorizationStripped` is computed as `rawAuthorizationPresent && !preserveAuthorization` — a logical fact that matches the strip rule applied inside `toRequest`. The two paths are kept consistent by the single source of truth `preserveAuthorization` (read once from `ENV`).

### Decision 8: Strip on every method, not only on POST

The existing `testWorkarounds` block only fires for `POST` because the empty-form workaround is POST-specific. The new auth instrumentation must fire for every method, because the diagnostic evidence shows Azure injects `Authorization` on every method. The strip step itself is method-agnostic — it lives in `toRequest` (or its extracted helper), runs on every request, and is gated only by `preserveAuthorization`. The `testWorkarounds`-only branch that builds and emits the JSON payload is extended so it runs on every method when `testWorkarounds` is `true` and either the empty-form path or the auth path has facts to report. The transport header is only set when at least one namespace has facts (i.e. when the request is `POST` and the empty-form check ran, or when `testWorkarounds` is `true` for the auth probe).

This means the `testWorkarounds`-only block on the response side (which currently mirrors the workaround info into the rendered response headers for the e2e empty-form test) also needs to widen its method gate so the auth info reaches the test client across all probed methods.

**Alternatives considered:**

- **Only emit auth info on POST** — rejected, narrows the diagnostic without reason and would make the rewrite-vs-fallback per-method comparison incomplete.

### Decision 9: Extract a small internal helper next to entry.js (preferred); export `toRequest` only as a fallback

The current `toRequest(httpRequest, testWorkaroundsInfo)` is a pure function over a `@azure/functions`-shaped `HttpRequest` and an info object, but it imports the build-time virtual `ENV` module, which makes direct unit-testing of `entry.js` (with mocked `ENV` / `MANIFEST` / `SERVER`) more setup than the strip behaviour warrants. We pick the helper-extraction path by default. Two options, in order of preference:

1. **(Preferred) Extract a small internal helper next to `entry.js`** — e.g. `src/server/entry/copy-headers.js`. The helper covers ONLY deterministic logic:
   - copy inbound headers except `x-ms-original-url`;
   - strip `Authorization` case-insensitively when `preserveAuthorization` is `false`;
   - preserve `Authorization` when `preserveAuthorization` is `true`;
   - preserve unrelated headers as-is;
   - compute `AdapterTestWorkaroundsInfo.auth` from raw inbound headers BEFORE stripping;
   - keep / migrate the empty-form content-type stripping workaround info into the new nested shape.

   The helper takes `(headers, { preserveAuthorization, testWorkarounds, ... })` and returns the downstream headers plus (when `testWorkarounds` is `true`) the populated `AdapterTestWorkaroundsInfo`. It never throws on a missing `x-ms-original-url`; that responsibility stays in `entry.js`. `Request.url` construction from `x-ms-original-url` stays in `entry.js`. Unit tests import the helper directly from `src/server/entry/copy-headers.js` — they do NOT load `entry.js` with mocked `ENV` / `MANIFEST` / `SERVER`.

2. **(Fallback) Export `toRequest` from `entry.js`** and call it directly from a unit test (with `ENV` / `MANIFEST` / `SERVER` mocked the way `tests/unit/index.test.js` mocks `fs` and `rolldown`). Use this path only if helper extraction proves clearly worse after inspecting the current code.

The helper's contract is asserted by the unit tests listed in the spec. Public adapter API is unchanged.

**Alternatives considered:**

- **Add a public helper to `src/index.js`** — rejected, public API surface change.
- **Test only via the demo's e2e** — rejected, unit coverage for the strip behaviour is faster, deterministic, and runs without `swa start`.

### Decision 10: e2e expectations branch on `PUBLIC_SWA_CLI` and `CI`, mirroring the empty-form test

The existing diagnostic routes `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite` are kept as-is. They continue to return sanitized SvelteKit-level diagnostics, and the route-mode matrix and attachment naming (`nav-fallback/<probe-key>.json`, `rewrite/<probe-key>.json`) are unchanged. What changes BY DESIGN is the values those routes report after the fix, because the adapter strips `Authorization` before SvelteKit sees it.

The existing empty-form test in [tests/demo/e2e/demo.test.ts](tests/demo/e2e/demo.test.ts) already differentiates local-SWA-CLI vs real-Azure with `const isSwaCli = process.env.PUBLIC_SWA_CLI === 'true'; const isLiveAzure = process.env.CI === 'true' && !isSwaCli;`. The diagnostic-headers test will reuse the same pattern (extract the predicate into the test file's prelude if it isn't already a shared helper) and assert the four matrix cells described in Decision 5.

The SvelteKit-level facts (the existing `DiagnosticFacts`) will assert, against both local SWA CLI and real Azure SWA, on every probe (auth and baseline), through both `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite`:

- `authorizationPresent === false` — the adapter stripped `Authorization` before SvelteKit saw it.
- `authorizationEqualsTestAuthorization === null` — comparison is undefined when `Authorization` is absent.
- `testAuthorizationPresent === true` on every probe; the existing `x-test-authorization` / `x-test-probe-id` control-header plumbing is unchanged.

Pre-strip Authorization diagnostics live exclusively in `x-adapter-test-workarounds.auth`, gated by `testWorkarounds`. The new adapter-level facts assert the four cells from Decision 5. The test reads the transport header off the response (the existing empty-form test already shows the pattern), JSON-parses the namespaced payload, and asserts on the `auth` namespace.

**Alternatives considered:**

- **Run only one cell (Azure-with-auth) and trust the others** — rejected, the baseline cells are the canary; without them the test cannot distinguish "fix works" from "Azure changed behaviour".
- **Drop the SvelteKit-level assertion entirely** — rejected, the SvelteKit-level surface is the user-visible behaviour and must be asserted for regression protection.
- **Remove or redesign the diagnostic-headers routes** — rejected. Their shape is fine; only their expected values shift after the fix.

### Decision 11: Keep `x-ms-original-url` consumption unchanged

`Request.url` continues to be built from `httpRequest.headers.get('x-ms-original-url')`, and `x-ms-original-url` continues to be filtered out of the downstream `Request.headers`. This change does not touch that path. A unit test asserts the filter still applies (regression check).

### Decision 12: Documentation tone — security default, escape hatch, app-specific bearer caveat

The README option entry for `preserveAuthorization` says three things: (1) default `false` is based on observed Azure SWA behaviour that injects/overwrites the inbound `Authorization` header; (2) `preserveAuthorization: true` is an opt-in escape hatch for consumers who explicitly want the platform-supplied value; (3) consumers who need a client-supplied bearer token to traverse SWA cleanly will likely need an app-specific custom header (e.g. `x-app-authorization`) rather than `Authorization`, regardless of this option, because SWA's behaviour around `Authorization` is not under the adapter's control.

## Risks / Trade-offs

- **[Risk] Default behaviour change breaks consumers who relied on the platform-injected `Authorization`.** → **Mitigation:** the README documents the new default and the `preserveAuthorization: true` escape hatch. The change note at archive time will call this out as a breaking-by-default change. Consumers whose apps were already broken by the platform injection are net-positive after this change.
- **[Risk] Consumers who relied on `Authorization` from a real client may not realise their reliance was already broken on Azure SWA.** → **Mitigation:** the README explicitly recommends an app-specific custom header for client bearer auth behind SWA, regardless of `preserveAuthorization`.
- **[Risk] Unit tests for the strip behaviour need a stable seam.** → **Mitigation:** the preferred path (Decision 9) extracts a small internal helper next to `entry.js` (e.g. `src/server/entry/copy-headers.js`) that unit tests import directly, avoiding the `ENV` / `MANIFEST` / `SERVER` mocking dance. Exporting `toRequest` is kept as a fallback only.
- **[Risk] e2e expectations make the test fragile against future Azure SWA changes (e.g. Azure stops injecting).** → **Trade-off accepted:** the four-cell matrix is intentionally tight. If Azure stops injecting, the `(true, true, false, true)` baseline cell will fail in CI, prompting a deliberate revisit and possible removal of the workaround. That is a feature, not a bug — silent drift in platform behaviour is exactly what we want CI to surface.
- **[Trade-off] No `Host` / `X-Forwarded-*` normalization in this change.** The diagnostic evidence covers them, and a follow-up change can address them with the same evidence-first approach.
- **[Trade-off] `x-test-workaround-authorization` is a third test control header alongside `x-test-authorization` and the `x-test-probe-id` pair.** Keeping the two layers independently testable is worth the third header.

## Migration Plan

1. Implement the change on a feature branch.
2. Run the local validation chain in this exact order (format BEFORE lint):
   1. `npm run format`
   2. `npm run lint`
   3. `npm run check`
   4. `npm run test:swa --prefix tests/demo`

   Confirm: SvelteKit-level facts no longer report `Authorization` presence; `x-adapter-test-workarounds.auth` reports the local-CLI cells correctly; the empty-form test still passes; the new unit tests pass.
3. Run `openspec validate strip-swa-authorization --strict` and resolve any issues.
4. Push the branch and open a PR. CI's `swa / azure (<node-version>)` job runs against the deployed Azure SWA preview URL and asserts the real-Azure cells.
5. Update the change archive at completion.

Rollback: `git revert` the merge commit. Consumers who shipped with the new default but want the prior behaviour can ship `preserveAuthorization: true` without rolling back.

## Open Questions

- Should `preserveAuthorization` be a tri-state (e.g. `'strip' | 'preserve'` plus a future `'rename'`) or a boolean? **Decision:** boolean. The user instruction is explicit. A future `rename`-style behaviour is a separate change with its own option (or a refinement of this one).
- Should the auth diagnostics fire only when `testWorkarounds` is `true`, or also when `debug` is `true`? **Decision:** only when `testWorkarounds` is `true`. `debug` is a logging-volume flag; the auth diagnostics are a wire-format-shaping flag. Mixing them would broaden the scope of `debug`.
- Should the auth diagnostics also include a presence check for `x-test-authorization` (the SvelteKit-level comparator) so the adapter-level payload can pre-confirm what the SvelteKit-level test will see? **Decision:** no. `x-test-authorization` is the SvelteKit-level diagnostic comparator; including it in the adapter-level payload couples the two layers and would make the unit-test contract harder to reason about.

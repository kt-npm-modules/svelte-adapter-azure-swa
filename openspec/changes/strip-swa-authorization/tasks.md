## 1. Wire `preserveAuthorization` through the adapter ENV pipeline

- [ ] 1.1 Add `preserveAuthorization?: boolean` to the `Options` type in [src/index.d.ts](src/index.d.ts), positioned next to the existing `debug` and `testWorkarounds` fields. Do not add or remove any other field.
- [ ] 1.2 In [src/server/index.js](src/server/index.js) `writeEnvironment`, resolve the option as `const preserveAuthorization = options.preserveAuthorization ?? false;` and emit `export const preserveAuthorization = ${preserveAuthorization.toString()};` into the generated `env.js` alongside the existing `debug` and `testWorkarounds` lines.
- [ ] 1.3 In [src/server/entry/index.d.ts](src/server/entry/index.d.ts), add `export const preserveAuthorization: boolean;` to the `declare module 'ENV'` block.
- [ ] 1.4 In [src/server/entry/entry.js](src/server/entry/entry.js), add `preserveAuthorization` to the `import { debug, testWorkarounds } from 'ENV';` statement.

## 2. Refactor `testWorkaroundsInfo` shape inside `entry.js`

- [ ] 2.1 In [src/server/entry/entry.js](src/server/entry/entry.js), replace the `/** @type {Record<string, any>} */` typedef on `testWorkaroundsInfo` with a JSDoc `AdapterTestWorkaroundsInfo` typedef (kept local to `entry.js`):
  - `EmptyFormContentTypeStripInfo` with fields `method: string`, `contentType: string|null`, `contentLength: string|null`, `hasBodyObject: boolean`, `emptyPostWorkaround: boolean`.
  - `AuthWorkaroundInfo` with fields `rawAuthorizationPresent: boolean`, `testWorkaroundAuthorizationPresent: boolean`, `rawAuthorizationEqualsTestWorkaroundAuthorization: boolean|null`, `authorizationStripped: boolean`.
  - `AdapterTestWorkaroundsInfo` with optional `emptyFormContentTypeStrip` and optional `auth`.
- [ ] 2.2 Move the existing empty-form fields (`method`, `contentType`, `contentLength`, `hasBodyObject`, `emptyPostWorkaround`) under `testWorkaroundsInfo.emptyFormContentTypeStrip = { ... }` instead of assigning them at the top level. The trigger condition (POST + the empty-form heuristic) is unchanged.
- [ ] 2.3 Confirm the existing `request.headers.set('x-adapter-test-workarounds', JSON.stringify(testWorkaroundsInfo))` and `rendered.headers.set('x-adapter-test-workarounds', ...)` mirroring continues to work — no second transport header is introduced.

## 3. Compute `auth` namespace before strip and emit it on every method

- [ ] 3.1 In `entry.js`, before calling `toRequest`, compute the `auth` namespace from `httpRequest.headers` whenever `testWorkarounds === true`. Read `httpRequest.headers.get('authorization')` and `httpRequest.headers.get('x-test-workaround-authorization')` (case-insensitive `Headers.get` already handles casing). Compute:
  - `rawAuthorizationPresent`: boolean from `authorization != null`
  - `testWorkaroundAuthorizationPresent`: boolean from `xTestWorkaroundAuthorization != null`
  - `rawAuthorizationEqualsTestWorkaroundAuthorization`: `null` when either is missing; otherwise `authorization === xTestWorkaroundAuthorization`. (No constant-time required — the values are test control headers under our control. Plain `===` keeps the helper trivial; if a future review prefers constant-time, swap to `timingSafeEqual` over equal-length buffers.)
  - `authorizationStripped`: `rawAuthorizationPresent && !preserveAuthorization`
- [ ] 3.2 Assign the computed object to `testWorkaroundsInfo.auth = { ... }`.
- [ ] 3.3 Widen the method gate of the existing `testWorkarounds` blocks: the auth namespace must be emitted on every adapter-supported method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`), while the empty-form namespace remains POST-only. Keep the transport-header set call (`request.headers.set` and `rendered.headers.set`) gated on `testWorkarounds === true` (no longer on `httpRequest.method === 'POST'` alone).
- [ ] 3.4 Confirm no raw `Authorization` value, no raw `x-test-workaround-authorization` value, and no Azure-injected bearer token ever gets copied into `testWorkaroundsInfo` or its serialized JSON. Only booleans and the tri-state.

## 4. Strip `Authorization` in the request-construction path

- [ ] 4.1 Inside the `httpRequest.headers.forEach(...)` loop in `toRequest`, extend the skip rule from `key !== 'x-ms-original-url'` to also skip headers whose name lowercases to `"authorization"` when `preserveAuthorization === false`. The match MUST be case-insensitive (`key.toLowerCase() === 'authorization'`) — do not rely on the iterator emitting lowercased keys.
- [ ] 4.2 Confirm the `Request.url` construction still uses `httpRequest.headers.get('x-ms-original-url')` unchanged, and the `x-ms-original-url` skip in the iterator is unchanged.
- [ ] 4.3 Confirm `Authorization` is not relocated to any other header (e.g. `x-ms-swa-authorization`, `x-original-authorization`) — strip is strip; the value is dropped.
- [ ] 4.4 If `preserveAuthorization === true`, the strip rule does not fire and the inbound `Authorization` is forwarded byte-for-byte.

## 5. Make `toRequest` (or a small helper) unit-testable

- [ ] 5.1 Choose between (a) extracting the minimal deterministic header-copy/auth/test-workaround logic into a small internal helper next to `entry.js` (e.g. `src/server/entry/copy-headers.js`) and unit-testing the helper, or (b) exporting `toRequest` from `entry.js` so it can be imported in a unit test. Default to (a) — extract the internal helper next to `entry.js` (e.g. `src/server/entry/copy-headers.js`); fall back to (b) only if helper extraction proves clearly worse after inspecting the current code. The helper covers only deterministic logic (copy inbound headers except `x-ms-original-url`; strip `Authorization` case-insensitively when `preserveAuthorization` is false; preserve `Authorization` when true; preserve unrelated headers; compute `AdapterTestWorkaroundsInfo.auth` from raw inbound headers BEFORE stripping; keep/migrate the empty-form content-type stripping workaround info into the new nested shape). `Request.url` construction from `x-ms-original-url` stays in `entry.js`.
- [ ] 5.2 Add the helper file under `src/server/entry/` and call it from `toRequest`. The helper takes the inbound headers and `{ preserveAuthorization }` and returns the filtered downstream headers; prefer keeping the auth-info computation inside the helper (it computes `AdapterTestWorkaroundsInfo.auth` from raw inbound headers before stripping) so unit tests can drive it deterministically. The `x-ms-original-url` consumption for `Request.url` stays in `entry.js`. No public API surface is added.
- [ ] 5.3 Confirm the chosen approach does not change the public adapter API in [src/index.js](src/index.js) or [src/index.d.ts](src/index.d.ts) beyond `preserveAuthorization`.

## 6. Add adapter unit coverage

- [ ] 6.1 Add a new unit-test file (e.g. `tests/unit/copy-headers.test.js`) that imports the internal helper directly from `src/server/entry/` and exercises the deterministic header-copy/auth/test-workaround logic. Tests SHALL import the internal helper directly rather than `entry.js` with mocked `ENV` / `MANIFEST` / `SERVER`, unless there is a strong implementation reason to do otherwise.
- [ ] 6.2 Cover every scenario enumerated under `Requirement: Adapter unit coverage exists for the header-copy and auth-info behaviour` in `openspec/changes/strip-swa-authorization/specs/adapter-authorization-policy/spec.md`. Unit tests are split by layer:
  - **Helper-level coverage (required)** — drive the internal helper directly:
    - default behaviour strips `Authorization`
    - explicit `preserveAuthorization: false` strips `Authorization`
    - `preserveAuthorization: true` preserves `Authorization`
    - unrelated headers (`Content-Type`, `X-Custom`, etc.) are preserved
    - stripping is case-insensitive (`AUTHORIZATION`, `Authorization`, `aUtHoRiZaTiOn`)
    - `x-ms-original-url` is excluded from the returned downstream headers (helper-level only — do NOT assert `Request.url` here; that responsibility stays in `entry.js`/`toRequest`)
    - empty-form content-type stripping behaviour is not regressed (POST + heuristic → `Content-Type` set; `emptyFormContentTypeStrip.emptyPostWorkaround === true`)
    - `testWorkaroundsInfo` is nested: empty-form facts under `emptyFormContentTypeStrip`, auth facts under `auth`; legacy flat keys absent
    - auth equality `null` when `x-test-workaround-authorization` is missing
    - auth equality `true` when both present and equal
    - auth equality `false` when both present and different
    - `authorizationStripped === true` when raw present and `preserveAuthorization: false`
    - `authorizationStripped === false` when raw absent
  - **Entry/`toRequest`-level coverage (only if practical without exporting `toRequest`)**:
    - `Request.url` is still constructed from `x-ms-original-url` — add ONLY if a test can be added without exporting `toRequest` from `entry.js` and without expanding the public API
    - if no practical direct unit coverage exists, OMIT this test — existing integration / e2e coverage of the diagnostic-headers routes already exercises `Request.url`; the requirement of this change is that `x-ms-original-url` behaviour is unchanged, not newly proven by a unit test
- [ ] 6.3 Run `npm run test` (the unit tests under `tests/unit`) and confirm all new tests pass.

## 7. Update the demo's diagnostic-headers e2e expectations

- [ ] 7.0 Do NOT redesign the existing diagnostic routes (`/diagnostic-headers-nav-fallback`, `/diagnostic-headers-rewrite`), the existing route-mode matrix, or the attachment naming (`nav-fallback/<probe-key>.json`, `rewrite/<probe-key>.json`). Only the assertions inside `tests/demo/e2e/diagnostic-headers.test.ts` are updated to match the four matrix cells below.
- [ ] 7.1 In [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts), extend `controlHeaders(...)` to also include `'x-test-workaround-authorization': bearer` on every probe (auth and baseline). Reuse the same per-test `diagnosticBearer` value already used for `x-test-authorization` and `Authorization`.
- [ ] 7.2 Add an `isSwaCli` / `isLiveAzure` predicate to the test prelude using the same `process.env.PUBLIC_SWA_CLI` / `process.env.CI` pattern as [tests/demo/e2e/demo.test.ts](tests/demo/e2e/demo.test.ts) lines 96-97. Extract into a small local helper if desired.
- [ ] 7.3 Add a helper that reads the `x-adapter-test-workarounds` response header (where present), JSON-parses it, and returns the `auth` namespace (or `null` when the header is absent). The helper SHALL NOT throw when the header is absent — diagnostic-headers tests should still record the SvelteKit-level facts even if the adapter-level header didn't ride along on the response (e.g. on `HEAD` where the body is empty but headers still arrive).
- [ ] 7.4 In `assertCoreShape` (or a new sibling assertion), assert the SvelteKit-level fields under default policy: `authorizationPresent === false`, `testAuthorizationPresent === true`, `authorizationEqualsTestAuthorization === null`. These hold for every probe (auth and baseline) on both routes in both environments.
- [ ] 7.5 Add a per-probe assertion on the `auth` namespace (when the response carries `x-adapter-test-workarounds`) that matches the four-cell matrix:
  - Auth probe + `isSwaCli`: `(true, true, true, true)`
  - Auth probe + `isLiveAzure`: `(true, true, false, true)`
  - Baseline probe + `isSwaCli`: `(false, true, null, false)`
  - Baseline probe + `isLiveAzure`: `(true, true, false, true)`
- [ ] 7.6 Confirm at least one auth probe per environment and one baseline per environment exercises the matrix cell. (The 16-probe matrix already covers both auth and baseline per route mode; the test only needs to assert on one method's worth of cells per environment to satisfy the spec — but it is cleaner to assert on every probe so the failure point is obvious.)
- [ ] 7.7 Confirm no raw `Authorization` value, no raw `x-test-workaround-authorization` value, no `diagnosticBearer`, no `probeId`, and no Azure bearer token ever appears in any test attachment (the existing `assertCoreShape` string-search guard against `diagnosticBearer` and `probeId` already covers this; extend it to also reject the `auth` namespace's raw values if any leak in — they should not, given the `auth` namespace is booleans-only).

## 8. Update the existing empty-form workaround test

- [ ] 8.1 In [tests/demo/e2e/demo.test.ts](tests/demo/e2e/demo.test.ts), update both `POST empty-body edge case currently does not expose workaround marker` tests (the one that uses `request.fetch` and the one that uses native `fetch`) to read `emptyFormContentTypeStrip.emptyPostWorkaround` instead of the legacy top-level `emptyPostWorkaround` from the parsed `x-adapter-test-workarounds` payload.
- [ ] 8.2 In [tests/demo/src/routes/empty-post-form/+page.server.ts](tests/demo/src/routes/empty-post-form/+page.server.ts), update the action to read `parsed.emptyFormContentTypeStrip` instead of treating the parsed payload as flat. Continue to expose the namespace on `form.workaroundsInfo` for the page Svelte component, but rename or restructure the field referenced in [tests/demo/src/routes/empty-post-form/+page.svelte](tests/demo/src/routes/empty-post-form/+page.svelte) to read from the namespace (`form.workaroundsInfo?.emptyPostWorkaround` becomes `form.workaroundsInfo?.emptyFormContentTypeStrip?.emptyPostWorkaround`). Keep the marker IDs unchanged so the existing `await expect(page.locator('#empty-post-workaround-marker'))` in `demo.test.ts` continues to drive the assertion.
- [ ] 8.3 Run `npm run test:swa --prefix tests/demo` locally and confirm the empty-form e2e test still passes under both `PUBLIC_SWA_CLI=true` (local CLI, marker `false`) and the Azure CI matrix (live Azure, marker `true`) without regression.

## 9. Document `preserveAuthorization` in the README

- [ ] 9.1 In [README.md](README.md) under the existing "Diagnostics and test-oriented options" section, add a `preserveAuthorization` entry alongside `debug` and `testWorkarounds`.
- [ ] 9.2 The entry SHALL document the default `false`, the rationale (Azure SWA injects/overwrites `Authorization` on managed Functions, evidenced by issue #218 diagnostics), the escape-hatch semantics (`preserveAuthorization: true` forwards the inbound value byte-for-byte), and the bearer-auth-behind-SWA caveat (apps relying on a client-supplied bearer token behind SWA will likely need an app-specific custom header, regardless of this option).
- [ ] 9.3 Optionally cross-link to the resolved issue #218 thread for the empirical evidence.

## 10. Validation

- [ ] 10.1 Run `npm run format`. Resolve any reported formatting issues.
- [ ] 10.2 Run `npm run lint`. Resolve any reported lint issues.
- [ ] 10.3 Run `npm run check`. Resolve any reported type issues. The new JSDoc typedefs in `entry.js` SHALL pass `svelte-check` / `tsc` in JS-with-JSDoc mode.
- [ ] 10.4 Run the unit tests (`npm test` at repo root or as configured) and confirm all new and existing tests pass.
- [ ] 10.5 Run `npm run test:swa --prefix tests/demo` locally. Confirm: all 16 diagnostic-headers probes pass; the empty-form e2e tests pass; the SvelteKit-level facts report `authorizationPresent === false` everywhere; the `auth` namespace cells match the local-SWA-CLI side of the matrix.
- [ ] 10.6 Push the branch and confirm the `swa / azure (<node-version>)` CI job exercises the real-Azure cells. Download the `playwright-report-azure-node<v>` artifact and confirm the `auth` namespace cells match the real-Azure side of the matrix.
- [ ] 10.7 Run `openspec validate strip-swa-authorization --strict` and resolve any issues.

## 11. Final verification

- [ ] 11.1 `git diff src/` shows: `Options.preserveAuthorization?: boolean` added to `index.d.ts`; `writeEnvironment` emits `preserveAuthorization`; `ENV` module declares `preserveAuthorization: boolean`; `entry.js` imports `preserveAuthorization`, refactors `testWorkaroundsInfo` to nested namespaces, computes the `auth` namespace before strip, and skips `Authorization` case-insensitively when `preserveAuthorization === false`. Under the preferred path of Decision 9, an internal helper file under `src/server/entry/` (e.g. `copy-headers.js`) is added. No other adapter files are touched.
- [ ] 11.2 `git diff tests/demo/` is limited to: `e2e/diagnostic-headers.test.ts` (added `x-test-workaround-authorization` and the four-cell `auth` namespace assertions); `e2e/demo.test.ts` (updated to read `emptyFormContentTypeStrip.emptyPostWorkaround`); `src/routes/empty-post-form/+page.server.ts` and `+page.svelte` (updated to read from the nested namespace).
- [ ] 11.3 `git diff tests/unit/` adds the new `entry.test.js` (or equivalent file) only. No public API expansion.
- [ ] 11.4 `git diff README.md` is limited to the new `preserveAuthorization` documentation entry under the existing options section.
- [ ] 11.5 `git diff .github/` produces no output — no workflow change is required by this scope; the existing CI artifact upload already covers the new attachments.
- [ ] 11.6 The diff does not introduce a `x-ms-swa-authorization` header, a `Host` / `X-Forwarded-*` normalization, a new diagnostic route, or any public API change beyond `preserveAuthorization?: boolean` (the public API surface change is strictly limited to `preserveAuthorization?: boolean` in `Options`).

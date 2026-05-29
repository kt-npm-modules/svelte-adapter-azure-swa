## REMOVED Requirements

### Requirement: Adapter behavior is unchanged

**Reason**: This change implements the Authorization policy fix called for by the diagnostic evidence captured in the previous archived diagnostics changes. The adapter is now intentionally modified — `Authorization` is stripped before the SvelteKit `Request` is constructed — so the previous spec's "no `src/` edits" guarantee no longer applies. The adapter-level contract is moved into the new `adapter-authorization-policy` capability.

**Migration**: Adapter-level guarantees about request handling are now expressed in `openspec/specs/adapter-authorization-policy/spec.md`. The demo-diagnostics capability remains the e2e-level contract for the diagnostic probe.

### Requirement: Adapter request behavior is unchanged

**Reason**: Same as the previous removal — the adapter's `toRequest` semantics are now intentionally modified to strip `Authorization` (case-insensitive, gated by `preserveAuthorization`).

**Migration**: See `openspec/specs/adapter-authorization-policy/spec.md` for the new adapter-level contract: `preserveAuthorization?: boolean` option, default-`false` strip rule, case-insensitive match, opt-in preservation, unchanged `x-ms-original-url` behaviour.

## ADDED Requirements

### Requirement: Diagnostic-headers e2e asserts the fixed default Authorization behaviour

The existing Playwright suite at [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts) SHALL continue to use the existing diagnostic routes `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite`, the existing route-mode matrix, and the existing per-mode attachment naming (`nav-fallback/<probe-key>.json` and `rewrite/<probe-key>.json`). This change does NOT redesign the routes, the matrix, or the attachment layout, and does NOT relax the existing safety posture (no Azure-injected bearer values land on disk or in logs). Only the expected values asserted at the SvelteKit level shift, and the new `x-adapter-test-workarounds.auth` assertions are added on top.

After the adapter fix is in effect with default options, the SvelteKit-level `DiagnosticFacts` returned by both `/diagnostic-headers-nav-fallback` and `/diagnostic-headers-rewrite` SHALL report:

- `authorizationPresent === false` on every probe (auth probes and no-auth baselines) on both the local SWA CLI emulator and a real Azure SWA deployment.
- `testAuthorizationPresent === true` on every probe (the `x-test-authorization` test control header is unaffected by the fix).
- `authorizationEqualsTestAuthorization === null` because `Authorization` was stripped before SvelteKit observed it (so the comparator's left operand is absent).

These assertions SHALL hold for every adapter-supported HTTP method exercised by the existing 16-probe matrix and for both routing channels. The SvelteKit-level diagnostic route is NOT expected to prove Azure injection after the fix — the adapter intentionally hides the injected `Authorization` from SvelteKit. Pre-strip Authorization observation lives in the adapter-level `x-adapter-test-workarounds.auth` namespace described below.

#### Scenario: Authorization is absent from SvelteKit facts on local SWA CLI

- **WHEN** the e2e suite is run with `PUBLIC_SWA_CLI=true` (local SWA CLI emulator) and the adapter is configured with default options (no `preserveAuthorization`)
- **THEN** every probe's `DiagnosticFacts` SHALL report `authorizationPresent === false`
- **AND** every probe's `DiagnosticFacts` SHALL report `authorizationEqualsTestAuthorization === null`

#### Scenario: Authorization is absent from SvelteKit facts on real Azure SWA

- **WHEN** the e2e suite is run with `CI=true` and `PUBLIC_SWA_CLI` is not `true` (real Azure SWA deployment) and the adapter is configured with default options
- **THEN** every probe's `DiagnosticFacts` SHALL report `authorizationPresent === false`
- **AND** every probe's `DiagnosticFacts` SHALL report `authorizationEqualsTestAuthorization === null`

#### Scenario: `x-test-authorization` is preserved end-to-end

- **WHEN** an e2e probe sends `x-test-authorization: Bearer <diagnosticBearer>` to either route in either environment
- **THEN** the corresponding `DiagnosticFacts.testAuthorizationPresent` SHALL be `true`

### Requirement: Diagnostic-headers e2e sends `x-test-workaround-authorization` and asserts the four adapter-level matrix cells

The Playwright auth probes SHALL additionally send a test control header `x-test-workaround-authorization: Bearer <diagnosticBearer>` carrying the same per-test bearer value as `x-test-authorization` and `Authorization` (where applicable). This header is the comparator the adapter's `auth` namespace uses for the `rawAuthorizationEqualsTestWorkaroundAuthorization` field; it is never interpreted as authentication. The Playwright no-auth baseline probes SHALL also send `x-test-workaround-authorization` (so the comparator's right operand is always present in the diagnostic surface; only the inbound `Authorization` differs between probes).

The e2e suite SHALL parse the response header `x-adapter-test-workarounds` (when present) into the `AdapterTestWorkaroundsInfo` shape and assert the four matrix cells as below. The environment branching SHALL use the same `PUBLIC_SWA_CLI` / `CI` predicate the existing empty-form test in [tests/demo/e2e/demo.test.ts](tests/demo/e2e/demo.test.ts) uses (`isSwaCli = process.env.PUBLIC_SWA_CLI === 'true'; isLiveAzure = process.env.CI === 'true' && !isSwaCli`). At least one auth probe per environment and one baseline per environment SHALL assert the corresponding cell.

The four matrix cells:

- **Local SWA CLI auth probe** (auth probe under `PUBLIC_SWA_CLI=true`):
  - `auth.rawAuthorizationPresent === true`
  - `auth.testWorkaroundAuthorizationPresent === true`
  - `auth.rawAuthorizationEqualsTestWorkaroundAuthorization === true`
  - `auth.authorizationStripped === true`
- **Real Azure SWA auth probe** (auth probe under `CI=true && !isSwaCli`):
  - `auth.rawAuthorizationPresent === true`
  - `auth.testWorkaroundAuthorizationPresent === true`
  - `auth.rawAuthorizationEqualsTestWorkaroundAuthorization === false`
  - `auth.authorizationStripped === true`
- **Local SWA CLI no-Authorization baseline** (no-auth baseline under `PUBLIC_SWA_CLI=true`):
  - `auth.rawAuthorizationPresent === false`
  - `auth.testWorkaroundAuthorizationPresent === true`
  - `auth.rawAuthorizationEqualsTestWorkaroundAuthorization === null`
  - `auth.authorizationStripped === false`
- **Real Azure SWA no-Authorization baseline** (no-auth baseline under `CI=true && !isSwaCli`):
  - `auth.rawAuthorizationPresent === true`
  - `auth.testWorkaroundAuthorizationPresent === true`
  - `auth.rawAuthorizationEqualsTestWorkaroundAuthorization === false`
  - `auth.authorizationStripped === true`

These four cells SHALL be the canary that surfaces drift in real-Azure behaviour. If Azure ever stops injecting/overwriting `Authorization`, the real-Azure cells will fail in CI and prompt a deliberate revisit of this workaround.

#### Scenario: Probes send `x-test-workaround-authorization` alongside the existing controls

- **WHEN** any probe in the suite issues a request to either route
- **THEN** the request SHALL include `x-test-workaround-authorization: Bearer <diagnosticBearer>` together with the existing `x-test-authorization`, `x-test-probe-id`, and `x-test-expected-probe-id` headers

#### Scenario: Auth probe matches local SWA CLI cell

- **WHEN** an auth probe runs under `PUBLIC_SWA_CLI=true` (local SWA CLI emulator) and the response carries `x-adapter-test-workarounds`
- **THEN** the parsed `auth` namespace SHALL match the local SWA CLI auth probe cell exactly: `rawAuthorizationPresent === true`, `testWorkaroundAuthorizationPresent === true`, `rawAuthorizationEqualsTestWorkaroundAuthorization === true`, `authorizationStripped === true`

#### Scenario: Auth probe matches real Azure SWA cell

- **WHEN** an auth probe runs under `CI=true && !isSwaCli` (real Azure SWA deployment) and the response carries `x-adapter-test-workarounds`
- **THEN** the parsed `auth` namespace SHALL match the real Azure SWA auth probe cell exactly: `rawAuthorizationPresent === true`, `testWorkaroundAuthorizationPresent === true`, `rawAuthorizationEqualsTestWorkaroundAuthorization === false`, `authorizationStripped === true`

#### Scenario: No-auth baseline matches local SWA CLI cell

- **WHEN** a no-auth baseline probe runs under `PUBLIC_SWA_CLI=true` and the response carries `x-adapter-test-workarounds`
- **THEN** the parsed `auth` namespace SHALL match the local SWA CLI baseline cell exactly: `rawAuthorizationPresent === false`, `testWorkaroundAuthorizationPresent === true`, `rawAuthorizationEqualsTestWorkaroundAuthorization === null`, `authorizationStripped === false`

#### Scenario: No-auth baseline matches real Azure SWA cell

- **WHEN** a no-auth baseline probe runs under `CI=true && !isSwaCli` and the response carries `x-adapter-test-workarounds`
- **THEN** the parsed `auth` namespace SHALL match the real Azure SWA baseline cell exactly: `rawAuthorizationPresent === true`, `testWorkaroundAuthorizationPresent === true`, `rawAuthorizationEqualsTestWorkaroundAuthorization === false`, `authorizationStripped === true`

#### Scenario: Existing empty-form workaround behaviour is not regressed

- **WHEN** the existing empty-form e2e test (in `tests/demo/e2e/demo.test.ts` and via the `/empty-post-form` page action) is run after this change
- **THEN** it SHALL continue to pass with the empty-form workaround facts moved under `emptyFormContentTypeStrip` in the same single `x-adapter-test-workarounds` transport header (no new transport headers are introduced) — the test's expectations are updated to read `emptyFormContentTypeStrip.emptyPostWorkaround` rather than the legacy top-level `emptyPostWorkaround`, and the `auth` namespace lives alongside it under the same payload

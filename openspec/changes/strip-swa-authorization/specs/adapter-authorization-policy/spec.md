## ADDED Requirements

### Requirement: Adapter exposes `preserveAuthorization` boolean option with default `false`

The adapter SHALL accept an optional boolean option `preserveAuthorization` on its `Options` type at [src/index.d.ts](src/index.d.ts). When the option is omitted or set to `false`, the adapter SHALL strip the inbound `Authorization` header before constructing the SvelteKit `Request`. When the option is set to `true`, the adapter SHALL preserve the current behaviour and forward the inbound `Authorization` header unchanged. The option's default value SHALL be `false`. No public adapter API beyond this option SHALL be added or altered by this change.

#### Scenario: Option is documented in the public type surface

- **WHEN** [src/index.d.ts](src/index.d.ts) is read
- **THEN** the `Options` type SHALL contain `preserveAuthorization?: boolean` alongside the existing `debug` and `testWorkarounds` fields
- **AND** no other field SHALL be added or removed by this change

#### Scenario: Option default is `false`

- **WHEN** the adapter is instantiated without specifying `preserveAuthorization`
- **THEN** the generated server entry SHALL behave as if `preserveAuthorization` were explicitly `false`
- **AND** the inbound `Authorization` header SHALL be stripped before the SvelteKit `Request` is constructed

### Requirement: Adapter wires `preserveAuthorization` through the build-time `ENV` module

The adapter's server-bundle pipeline SHALL emit `preserveAuthorization` into the generated `ENV` virtual module from [src/server/index.js](src/server/index.js)'s `writeEnvironment`, in the same shape as `debug` and `testWorkarounds`. The `ENV` module typing at [src/server/entry/index.d.ts](src/server/entry/index.d.ts) SHALL declare a `preserveAuthorization: boolean` export. The generated server entry [src/server/entry/entry.js](src/server/entry/entry.js) SHALL import `preserveAuthorization` from `'ENV'` alongside `debug` and `testWorkarounds`.

#### Scenario: `writeEnvironment` emits `preserveAuthorization`

- **WHEN** the adapter builds the server bundle and `writeEnvironment` runs
- **THEN** the generated `env.js` file SHALL contain a top-level `export const preserveAuthorization = <true|false>;` line whose value reflects the resolved option (`options.preserveAuthorization ?? false`)
- **AND** the existing `export const debug = ...;` and `export const testWorkarounds = ...;` lines SHALL remain unchanged in placement and value

#### Scenario: `ENV` module declares `preserveAuthorization`

- **WHEN** [src/server/entry/index.d.ts](src/server/entry/index.d.ts) is read
- **THEN** the `declare module 'ENV'` block SHALL declare `export const preserveAuthorization: boolean;` alongside the existing `debug` and `testWorkarounds` declarations

#### Scenario: `entry.js` imports `preserveAuthorization`

- **WHEN** [src/server/entry/entry.js](src/server/entry/entry.js) is read
- **THEN** the top-of-file import from `'ENV'` SHALL include `preserveAuthorization` alongside `debug` and `testWorkarounds`

### Requirement: Default behaviour strips `Authorization` from the downstream SvelteKit `Request`

When `preserveAuthorization` is `false` (default or explicit), the adapter's request-construction path SHALL skip any header whose name lowercases to `"authorization"` while copying inbound headers into the downstream SvelteKit `Request` headers. The match SHALL be case-insensitive. The adapter SHALL NOT depend on the inbound iterator emitting lowercased keys for correctness — the case-insensitive comparison SHALL be applied explicitly. The adapter SHALL NOT move, rename, copy, or otherwise forward the inbound `Authorization` value to any other header on the downstream `Request`. The strip SHALL apply uniformly to every adapter-supported HTTP method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`).

#### Scenario: Default omitted — `Authorization` is stripped

- **WHEN** the adapter is instantiated without `preserveAuthorization` and an inbound request carries `Authorization: Bearer <token>`
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL return `null`

#### Scenario: Explicit `preserveAuthorization: false` — `Authorization` is stripped

- **WHEN** the adapter is instantiated with `preserveAuthorization: false` and an inbound request carries `Authorization: Bearer <token>`
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL return `null`

#### Scenario: Strip is case-insensitive

- **WHEN** the inbound headers iterator emits a key whose original case is `Authorization` (or any other casing such as `AUTHORIZATION`, `aUtHoRiZaTiOn`)
- **THEN** the adapter SHALL still skip that header and the downstream SvelteKit `Request.headers.get('authorization')` SHALL return `null`

#### Scenario: Authorization is not relocated

- **WHEN** the adapter strips an inbound `Authorization`
- **THEN** the downstream SvelteKit `Request.headers` SHALL NOT contain any other header (e.g. `x-ms-swa-authorization`, `x-original-authorization`) carrying the stripped value

#### Scenario: Strip applies to every HTTP method

- **WHEN** an inbound request with `Authorization` arrives via any of `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL return `null` for every method

### Requirement: `preserveAuthorization: true` forwards `Authorization` unchanged

When `preserveAuthorization` is `true`, the adapter SHALL preserve the inbound `Authorization` header as-is on the downstream SvelteKit `Request`. No transformation, lowercasing of the value, or other mutation SHALL be applied. The strip rule SHALL NOT fire.

#### Scenario: Opt-in preserves the inbound Authorization

- **WHEN** the adapter is instantiated with `preserveAuthorization: true` and an inbound request carries `Authorization: Bearer <token>`
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL return the original `Bearer <token>` value byte-for-byte

#### Scenario: Opt-in preserves the inbound Authorization across all methods

- **WHEN** the adapter is instantiated with `preserveAuthorization: true` and an inbound request with `Authorization` arrives via any adapter-supported HTTP method
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL return the original value for every method

### Requirement: Other inbound headers are preserved unchanged

The strip rule SHALL apply only to the `Authorization` header. All other inbound headers — including arbitrary application headers, `x-test-authorization`, `x-test-workaround-authorization`, `Content-Type`, `Content-Length`, `Cookie`, `x-forwarded-*`, `host`, `x-ms-client-principal`, and any other inbound name — SHALL be copied to the downstream SvelteKit `Request` headers as today. The existing `x-ms-original-url` filter SHALL remain in effect.

#### Scenario: Unrelated headers pass through

- **WHEN** an inbound request carries `Authorization`, `x-test-authorization`, `x-test-workaround-authorization`, `Content-Type: application/json`, and an arbitrary `X-Custom: foo` header
- **THEN** the downstream SvelteKit `Request.headers` SHALL contain `x-test-authorization`, `x-test-workaround-authorization`, `content-type`, and `x-custom` with their original values
- **AND** the downstream `Request.headers.get('authorization')` SHALL return `null` (default strip)

#### Scenario: `x-ms-original-url` continues to be filtered

- **WHEN** an inbound request carries `x-ms-original-url: https://example.com/path`
- **THEN** the downstream SvelteKit `Request.headers.get('x-ms-original-url')` SHALL return `null`
- **AND** the downstream `Request.url` SHALL be constructed from the `x-ms-original-url` value (existing behaviour preserved)

### Requirement: `Request.url` continues to be built from `x-ms-original-url`

The adapter SHALL continue to construct the downstream SvelteKit `Request.url` from the inbound `x-ms-original-url` header. The behaviour around `x-ms-original-url` SHALL NOT be modified by this change.

#### Scenario: `Request.url` reflects `x-ms-original-url`

- **WHEN** an inbound request carries `x-ms-original-url: https://example.com/some/path?q=1`
- **THEN** the downstream SvelteKit `Request.url` SHALL equal `https://example.com/some/path?q=1`

### Requirement: `x-adapter-test-workarounds` payload is a typed nested namespace

When `testWorkarounds` is `true`, the adapter SHALL continue to publish at most one transport header named `x-adapter-test-workarounds` whose value is the JSON serialization of an `AdapterTestWorkaroundsInfo` object. The shape of `AdapterTestWorkaroundsInfo` SHALL be a typed JSDoc object with two optional namespaces:

- `emptyFormContentTypeStrip?: EmptyFormContentTypeStripInfo` — carries the existing empty-form workaround fields (`method`, `contentType`, `contentLength`, `hasBodyObject`, `emptyPostWorkaround`).
- `auth?: AuthWorkaroundInfo` — carries the new auth workaround fields (`rawAuthorizationPresent`, `testWorkaroundAuthorizationPresent`, `rawAuthorizationEqualsTestWorkaroundAuthorization`, `authorizationStripped`).

The current loose `Record<string, any>` typedef SHALL be replaced by these typed JSDoc typedefs, kept local to [src/server/entry/entry.js](src/server/entry/entry.js) unless the file's existing convention clearly suggests another local placement. No new transport header SHALL be introduced. No raw header values, raw bearer tokens, or full URLs SHALL appear in the JSON payload.

#### Scenario: Empty-form facts are nested under `emptyFormContentTypeStrip`

- **WHEN** `testWorkarounds` is `true` and an inbound `POST` request triggers the existing empty-form content-type stripping branch
- **THEN** the `x-adapter-test-workarounds` JSON payload SHALL contain `emptyFormContentTypeStrip` with `method`, `contentType`, `contentLength`, `hasBodyObject`, and `emptyPostWorkaround` fields
- **AND** the payload SHALL NOT contain top-level `method`, `contentType`, `contentLength`, `hasBodyObject`, or `emptyPostWorkaround` fields
- **AND** the existing empty-form workaround behaviour SHALL be unchanged in semantics — only the location of the fields in the JSON shape changes

#### Scenario: Auth facts are nested under `auth`

- **WHEN** `testWorkarounds` is `true` for any adapter-supported HTTP method
- **THEN** the `x-adapter-test-workarounds` JSON payload SHALL contain `auth` with `rawAuthorizationPresent`, `testWorkaroundAuthorizationPresent`, `rawAuthorizationEqualsTestWorkaroundAuthorization`, and `authorizationStripped` fields
- **AND** the payload SHALL NOT contain those fields at the top level

#### Scenario: Single transport header

- **WHEN** the adapter emits the test-workarounds payload
- **THEN** exactly one response (and downstream `Request`) header named `x-adapter-test-workarounds` SHALL carry the JSON payload
- **AND** no separate `x-adapter-test-auth-workaround` (or similarly named) header SHALL be added

#### Scenario: No raw values in the payload

- **WHEN** the adapter computes the auth workaround info
- **THEN** the JSON payload SHALL NOT contain any substring of the inbound `Authorization` value, the inbound `x-test-workaround-authorization` value, or any Azure-injected bearer token

### Requirement: `AuthWorkaroundInfo` field semantics

The `AuthWorkaroundInfo` object SHALL carry exactly four fields with the following semantics, computed against the inbound `httpRequest.headers` BEFORE the strip step runs:

- `rawAuthorizationPresent: boolean` — `true` iff the inbound headers contained a header whose name lowercases to `"authorization"`; `false` otherwise.
- `testWorkaroundAuthorizationPresent: boolean` — `true` iff the inbound headers contained a header whose name lowercases to `"x-test-workaround-authorization"`; `false` otherwise. This header is a test control header only; the adapter SHALL NOT interpret its value as authentication.
- `rawAuthorizationEqualsTestWorkaroundAuthorization: boolean | null` — `true` only when both `rawAuthorizationPresent` and `testWorkaroundAuthorizationPresent` are `true` AND the two raw header values compare equal byte-for-byte; `false` only when both are `true` AND the two values differ; `null` when either header is absent (comparison is undefined).
- `authorizationStripped: boolean` — `true` iff `rawAuthorizationPresent` is `true` AND `preserveAuthorization` is `false` (i.e. the adapter actually removed the inbound `Authorization` from the downstream SvelteKit `Request`); `false` otherwise (including the case where `rawAuthorizationPresent` is `false` — nothing was removed).

#### Scenario: Auth info present, equality undefined when no test header

- **WHEN** `testWorkarounds` is `true`, `preserveAuthorization` is `false`, and the inbound request carries `Authorization: Bearer foo` but does not carry `x-test-workaround-authorization`
- **THEN** the `auth` namespace SHALL contain `rawAuthorizationPresent === true`, `testWorkaroundAuthorizationPresent === false`, `rawAuthorizationEqualsTestWorkaroundAuthorization === null`, `authorizationStripped === true`

#### Scenario: Equality `true` when both present and identical

- **WHEN** the inbound request carries `Authorization: Bearer foo` and `x-test-workaround-authorization: Bearer foo`
- **THEN** the `auth` namespace SHALL contain `rawAuthorizationEqualsTestWorkaroundAuthorization === true`

#### Scenario: Equality `false` when both present and different

- **WHEN** the inbound request carries `Authorization: Bearer azure-injected` and `x-test-workaround-authorization: Bearer client-sent`
- **THEN** the `auth` namespace SHALL contain `rawAuthorizationEqualsTestWorkaroundAuthorization === false`

#### Scenario: Equality `null` when raw `Authorization` is absent

- **WHEN** the inbound request carries `x-test-workaround-authorization: Bearer client-sent` but no `Authorization`
- **THEN** the `auth` namespace SHALL contain `rawAuthorizationPresent === false`, `testWorkaroundAuthorizationPresent === true`, `rawAuthorizationEqualsTestWorkaroundAuthorization === null`, `authorizationStripped === false`

#### Scenario: `authorizationStripped` false when raw absent

- **WHEN** the inbound request does not carry `Authorization`
- **THEN** the `auth` namespace SHALL contain `authorizationStripped === false` regardless of the value of `preserveAuthorization`

#### Scenario: `authorizationStripped` true when raw present and default policy

- **WHEN** the inbound request carries `Authorization` and `preserveAuthorization` is `false`
- **THEN** the `auth` namespace SHALL contain `authorizationStripped === true`

#### Scenario: `authorizationStripped` false when raw present and opt-in

- **WHEN** the inbound request carries `Authorization` and `preserveAuthorization` is `true`
- **THEN** the `auth` namespace SHALL contain `authorizationStripped === false`

### Requirement: Auth info is computed before the strip step

The adapter SHALL compute the `auth` namespace fields against the inbound `httpRequest.headers` BEFORE constructing the downstream SvelteKit `Request`. `rawAuthorizationPresent` SHALL reflect the inbound state, not the post-strip state. `authorizationStripped` SHALL be the logical fact `rawAuthorizationPresent && !preserveAuthorization`, computed from the same single-source `preserveAuthorization` flag that governs the actual strip.

#### Scenario: `rawAuthorizationPresent` reflects pre-strip state

- **WHEN** the inbound request carries `Authorization: Bearer foo` and `preserveAuthorization` is `false`
- **THEN** `rawAuthorizationPresent` SHALL be `true` and `authorizationStripped` SHALL be `true` even though the downstream `Request.headers.get('authorization')` returns `null`

### Requirement: Auth diagnostics fire on every adapter-supported HTTP method

When `testWorkarounds` is `true`, the `auth` namespace SHALL be present on the `x-adapter-test-workarounds` payload for every adapter-supported HTTP method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`). The existing empty-form workaround namespace SHALL continue to be emitted only on `POST` requests as today; the auth namespace SHALL NOT be method-gated.

#### Scenario: Auth namespace appears on `GET`

- **WHEN** `testWorkarounds` is `true` and an inbound `GET` request arrives
- **THEN** the `x-adapter-test-workarounds` payload SHALL contain the `auth` namespace

#### Scenario: Auth namespace appears on `HEAD`

- **WHEN** `testWorkarounds` is `true` and an inbound `HEAD` request arrives
- **THEN** the `x-adapter-test-workarounds` payload SHALL contain the `auth` namespace

#### Scenario: Auth namespace appears on `POST` alongside empty-form namespace

- **WHEN** `testWorkarounds` is `true` and an inbound `POST` request arrives
- **THEN** the `x-adapter-test-workarounds` payload SHALL contain both the `auth` namespace and the `emptyFormContentTypeStrip` namespace
- **AND** the two namespaces SHALL be independent (the auth fields SHALL NOT depend on the empty-form fields and vice versa)

### Requirement: Adapter unit coverage exists for the header-copy and auth-info behaviour

The repository SHALL contain unit tests under `tests/unit/` that cover the header-copy behaviour and the auth-info computation directly, without spinning up the demo or running Playwright. The PREFERRED path SHALL be to extract the minimal deterministic header-copy/auth/test-workaround logic from [src/server/entry/entry.js](src/server/entry/entry.js) into a small internal helper located next to it under `src/server/entry/` (e.g. `src/server/entry/copy-headers.js`), and to have the unit tests import that helper directly. Loading [src/server/entry/entry.js](src/server/entry/entry.js) with mocked `ENV`/`MANIFEST`/`SERVER` virtual modules SHALL be a fallback used ONLY when helper extraction proves clearly worse after inspecting the current code.

The unit-coverage matrix is split by layer:

- **Helper-level coverage (required)**: the internal helper SHALL cover only deterministic logic — `x-ms-original-url` is excluded from the returned downstream headers; Authorization strip/preserve behaviour under `preserveAuthorization: false` / `true` (case-insensitive); auth workaround info (`AdapterTestWorkaroundsInfo.auth`) computed from the raw inbound headers BEFORE stripping, including the tri-state equality and `authorizationStripped` rules; unrelated headers preserved; existing empty-form content-type stripping workaround info nested under `emptyFormContentTypeStrip` and not regressed. Helper tests SHALL NOT be required to prove `Request.url` construction.
- **Entry/`toRequest`-level coverage (only if practical without exporting `toRequest`)**: a single entry-level test MAY assert that `Request.url` is still constructed from `x-ms-original-url` IF and only IF such a test can be added without exporting `toRequest` from `entry.js` and without expanding the public API. If no practical direct unit coverage exists for `Request.url` without exporting `toRequest`, the test SHALL be omitted; existing integration / e2e coverage of the diagnostic-headers routes covers `Request.url` construction. The main requirement is that `x-ms-original-url` behaviour is unchanged — not newly refactored or newly proven by a unit test.

Construction of `Request.url` from `x-ms-original-url` SHALL remain in [src/server/entry/entry.js](src/server/entry/entry.js) unless it is already inside an existing easily testable helper. No public API surface beyond `preserveAuthorization` SHALL be added to satisfy this requirement; the helper SHALL be internal to the adapter and `toRequest` SHALL NOT be exported unless helper extraction proves clearly worse after inspecting the current code.

#### Scenario: Default behaviour strips Authorization (unit)

- **WHEN** the unit test invokes the request-building path with default options (or explicit `preserveAuthorization: false`) and an inbound headers map containing `Authorization: Bearer foo`
- **THEN** the resulting downstream `Request.headers.get('authorization')` SHALL be `null`

#### Scenario: `preserveAuthorization: false` strips Authorization (unit)

- **WHEN** the unit test invokes the request-building path with `preserveAuthorization: false` and an inbound headers map containing `Authorization: Bearer foo`
- **THEN** the resulting downstream `Request.headers.get('authorization')` SHALL be `null`

#### Scenario: `preserveAuthorization: true` preserves Authorization (unit)

- **WHEN** the unit test invokes the request-building path with `preserveAuthorization: true` and an inbound headers map containing `Authorization: Bearer foo`
- **THEN** the resulting downstream `Request.headers.get('authorization')` SHALL be `Bearer foo`

#### Scenario: Unrelated headers preserved (unit)

- **WHEN** the unit test invokes the request-building path with an inbound headers map containing `Authorization: Bearer foo`, `Content-Type: application/json`, and `X-Custom: bar`
- **THEN** the resulting downstream `Request.headers.get('content-type')` SHALL be `application/json` and `Request.headers.get('x-custom')` SHALL be `bar`

#### Scenario: Stripping is case-insensitive (unit)

- **WHEN** the unit test invokes the request-building path with an inbound headers map whose Authorization key is spelled `AUTHORIZATION` (or any non-lowercased casing)
- **THEN** the resulting downstream `Request.headers.get('authorization')` SHALL be `null`

#### Scenario: `x-ms-original-url` is excluded from downstream headers by the helper (unit)

- **WHEN** the helper-level unit test invokes the internal header-copy helper with an inbound headers map containing `x-ms-original-url: https://example.com/foo?q=1`
- **THEN** the resulting downstream headers SHALL NOT contain an `x-ms-original-url` entry
- **AND** the helper SHALL NOT be required to demonstrate `Request.url` construction — that responsibility stays in [src/server/entry/entry.js](src/server/entry/entry.js)/`toRequest` and is covered by existing integration / e2e tests; the helper is only required to prove that `x-ms-original-url` is excluded from the downstream headers it returns

#### Scenario: `Request.url` construction from `x-ms-original-url` (entry/toRequest level, only if practical without exporting `toRequest`)

- **WHEN** an entry/`toRequest`-level unit test can be added without exporting `toRequest` from `entry.js` and without breaking the "no public API beyond `preserveAuthorization`" constraint
- **THEN** that test SHOULD assert `Request.url` is constructed from the inbound `x-ms-original-url` value (existing behaviour preserved)
- **AND WHEN** no practical direct unit coverage for `Request.url` exists without exporting `toRequest`
- **THEN** the test SHALL be omitted at this level; existing integration / e2e coverage of the diagnostic-headers routes covers `Request.url` construction, and the requirement of this change is only that `x-ms-original-url` behaviour is unchanged — not newly refactored or newly proven by a unit test

#### Scenario: Existing empty-form content-type stripping behaviour is not regressed (unit)

- **WHEN** the unit test simulates an empty-form POST navigation (method `POST`, no `content-type`, `content-length: 0`, `sec-fetch-mode: navigate`, `sec-fetch-dest: document`) with `testWorkarounds: true`
- **THEN** the downstream `Request.headers.get('content-type')` SHALL be `application/x-www-form-urlencoded`
- **AND** the `x-adapter-test-workarounds` JSON payload SHALL contain `emptyFormContentTypeStrip.emptyPostWorkaround === true`

#### Scenario: `testWorkaroundsInfo` namespacing — empty-form and auth (unit)

- **WHEN** the unit test inspects the `x-adapter-test-workarounds` JSON payload after a `POST` with `testWorkarounds: true`
- **THEN** the empty-form facts SHALL be located at `emptyFormContentTypeStrip.*` and the auth facts SHALL be located at `auth.*`
- **AND** the legacy flat keys (e.g. top-level `emptyPostWorkaround`) SHALL NOT be present

#### Scenario: Auth equality `null` when test header missing (unit)

- **WHEN** the unit test invokes the request-building path with `testWorkarounds: true`, `Authorization: Bearer foo`, and no `x-test-workaround-authorization`
- **THEN** the resulting `auth` namespace SHALL contain `rawAuthorizationEqualsTestWorkaroundAuthorization === null`

#### Scenario: Auth equality `true` when both present and equal (unit)

- **WHEN** the unit test invokes the request-building path with `testWorkarounds: true`, `Authorization: Bearer foo`, and `x-test-workaround-authorization: Bearer foo`
- **THEN** the resulting `auth` namespace SHALL contain `rawAuthorizationEqualsTestWorkaroundAuthorization === true`

#### Scenario: Auth equality `false` when both present and different (unit)

- **WHEN** the unit test invokes the request-building path with `testWorkarounds: true`, `Authorization: Bearer azure`, and `x-test-workaround-authorization: Bearer client`
- **THEN** the resulting `auth` namespace SHALL contain `rawAuthorizationEqualsTestWorkaroundAuthorization === false`

#### Scenario: `authorizationStripped` true when raw present and default policy (unit)

- **WHEN** the unit test invokes the request-building path with `testWorkarounds: true`, `preserveAuthorization: false`, and `Authorization: Bearer foo`
- **THEN** the resulting `auth` namespace SHALL contain `authorizationStripped === true`

#### Scenario: `authorizationStripped` false when raw absent (unit)

- **WHEN** the unit test invokes the request-building path with `testWorkarounds: true`, `preserveAuthorization: false`, and no inbound `Authorization`
- **THEN** the resulting `auth` namespace SHALL contain `authorizationStripped === false`

### Requirement: README documents `preserveAuthorization`

The README's options section SHALL document `preserveAuthorization` alongside the existing `debug` and `testWorkarounds` entries. The documentation SHALL state: (a) the default value is `false`; (b) the default-`false` rationale is the empirical observation that real Azure SWA injects/overwrites the inbound `Authorization` header on managed Functions; (c) `preserveAuthorization: true` is an opt-in escape hatch for consumers who explicitly want the platform-supplied `Authorization` value; (d) consumers who need a client-supplied bearer token to traverse SWA cleanly will likely need an app-specific custom header rather than `Authorization`, regardless of this option.

#### Scenario: README has a `preserveAuthorization` entry

- **WHEN** the README is read
- **THEN** the options section SHALL contain a `preserveAuthorization` entry
- **AND** the entry SHALL explain the default-off behaviour, the rationale, and the escape-hatch semantics

#### Scenario: Bearer-auth-behind-SWA caveat is present

- **WHEN** the README is read
- **THEN** the documentation SHALL include a caveat that applications relying on a client-supplied bearer token behind SWA will likely need an app-specific custom header rather than `Authorization`

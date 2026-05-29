# adapter-forwarded-origin Specification

## Purpose

Defines the adapter's policy for normalizing the downstream origin-identifying headers (`host`, `x-forwarded-host`, `x-forwarded-proto`) from the trusted public `x-ms-original-url` header on Azure Static Web Apps managed Functions. The capability covers when normalization fires, which three headers are written, the overwrite-on-spoof rule, the interaction with the existing `x-ms-original-url`-driven `Request.url` construction (which is preserved unchanged and continues to exclude `x-ms-original-url` from the downstream headers), the absent/invalid fallback (no normalization, no new crash path), and the unit-coverage and README-documentation obligations.

This capability is the scope-1 half of issue #218. Scope 2 (Authorization handling) is owned by the separate `adapter-authorization-policy` capability and is explicitly out of scope here. Inbound headers other than the three named origin headers are preserved subject to whatever existing policies already govern them.

## Requirements

### Requirement: Adapter normalizes downstream origin headers from `x-ms-original-url`

When the inbound `x-ms-original-url` header is present and parses as a valid absolute URL via the WHATWG `URL` parser, the adapter SHALL normalize the downstream SvelteKit `Request` origin headers from that URL before constructing the `Request`. Specifically, the adapter SHALL:

- set the downstream `host` header to `originalUrl.host`,
- set the downstream `x-forwarded-host` header to `originalUrl.host`,
- set the downstream `x-forwarded-proto` header to `originalUrl.protocol` with the trailing colon stripped (e.g. `https`, not `https:`).

These three writes SHALL be unconditional whenever `x-ms-original-url` is present and parseable: they SHALL overwrite any inbound `host`, `x-forwarded-host`, or `x-forwarded-proto` value, regardless of whether that inbound value came from the SWA platform, an upstream proxy, or a client. `x-ms-original-url` SHALL be the single trusted source for the public origin.

The normalization SHALL be performed by the existing internal header-copy helper at [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js) (or its direct successor at the same seam), so that the resulting downstream headers map already contains the normalized values when [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` constructs the SvelteKit `Request`. The helper SHALL remain pure (no I/O, no logging, no time, no env reads).

#### Scenario: `host` is overwritten from `originalUrl.host`

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo?q=1` and `host: internal.azurewebsites.net`
- **THEN** the downstream SvelteKit `Request.headers.get('host')` SHALL be `example.com`

#### Scenario: `x-forwarded-host` is set when absent and overwritten when present

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo` and no `x-forwarded-host`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-host')` SHALL be `example.com`
- **AND WHEN** the inbound headers also carry `x-forwarded-host: stale.internal`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-host')` SHALL still be `example.com`

#### Scenario: `x-forwarded-proto` is the protocol scheme without the trailing colon

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-proto')` SHALL be `https`
- **AND** the value SHALL NOT contain a trailing `:` character

#### Scenario: Spoofed inbound `x-forwarded-host` is overwritten

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo` and `x-forwarded-host: attacker.example.org`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-host')` SHALL be `example.com`

#### Scenario: Spoofed inbound `x-forwarded-proto` is overwritten

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo` and `x-forwarded-proto: http`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-proto')` SHALL be `https`

#### Scenario: `originalUrl.host` includes the port when present

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com:8443/foo`
- **THEN** the downstream SvelteKit `Request.headers.get('host')` SHALL be `example.com:8443`
- **AND** the downstream SvelteKit `Request.headers.get('x-forwarded-host')` SHALL be `example.com:8443`

### Requirement: `x-ms-original-url` continues to drive `Request.url` and is excluded from downstream headers

The adapter SHALL continue to construct the downstream SvelteKit `Request.url` from the inbound `x-ms-original-url` header, using the same call site in [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest`. The adapter SHALL continue to exclude `x-ms-original-url` from the downstream SvelteKit `Request.headers`. This change SHALL NOT alter either behaviour.

#### Scenario: `Request.url` reflects `x-ms-original-url`

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/some/path?q=1`
- **THEN** the downstream SvelteKit `Request.url` SHALL equal `https://example.com/some/path?q=1`

#### Scenario: `x-ms-original-url` is not forwarded downstream

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo`
- **THEN** the downstream SvelteKit `Request.headers.get('x-ms-original-url')` SHALL return `null`

### Requirement: Non-origin inbound headers are preserved subject to existing policies

The normalization defined by this capability SHALL apply only to the three named origin headers (`host`, `x-forwarded-host`, `x-forwarded-proto`). All other inbound headers SHALL be passed to the downstream SvelteKit `Request.headers` exactly as they are today, subject to whatever existing policies already govern them.

In particular:

- The `Authorization` header is governed by the existing `adapter-authorization-policy` capability and the `preserveAuthorization` option. Its strip-by-default / opt-in-preserve behaviour SHALL remain exactly as defined there. This change SHALL NOT modify, weaken, or duplicate that policy.
- The existing `x-ms-original-url` exclusion SHALL remain in effect (it continues to drive `Request.url` construction in [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` and continues to be filtered out of the downstream headers).
- All other inbound headers — including `Content-Type`, `Content-Length`, `Cookie`, `x-forwarded-for`, `x-forwarded-port`, `forwarded`, `x-ms-client-principal`, application-defined headers, and any other inbound name not explicitly listed above — SHALL be copied byte-for-byte to the downstream SvelteKit `Request.headers`, exactly as before this change.

The only writes this change introduces to the downstream headers are the three origin-header overwrites (`host`, `x-forwarded-host`, `x-forwarded-proto`) when `x-ms-original-url` is present and parses as a valid absolute URL.

#### Scenario: Unrelated headers pass through unchanged

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo`, `Content-Type: application/json`, `X-Custom: bar`, and `x-forwarded-for: 203.0.113.5`
- **THEN** the downstream SvelteKit `Request.headers.get('content-type')` SHALL be `application/json`
- **AND** the downstream SvelteKit `Request.headers.get('x-custom')` SHALL be `bar`
- **AND** the downstream SvelteKit `Request.headers.get('x-forwarded-for')` SHALL be `203.0.113.5`

#### Scenario: Authorization-policy behaviour is unchanged and composes with origin normalization

- **WHEN** the inbound headers contain `x-ms-original-url: https://example.com/foo` and `Authorization: Bearer foo`
- **THEN** the downstream SvelteKit `Request.headers.get('authorization')` SHALL be whatever the existing `adapter-authorization-policy` capability already defines for that input (i.e. unchanged from today: stripped under default `preserveAuthorization: false`, preserved under `preserveAuthorization: true`)
- **AND** the host/x-forwarded-host/x-forwarded-proto SHALL still be normalized from `https://example.com/foo` independently of the Authorization decision

### Requirement: Absent or invalid `x-ms-original-url` preserves existing behaviour and adds no new crash path

When the inbound `x-ms-original-url` header is absent, OR when it is present but does not parse as a valid absolute URL via the WHATWG `URL` parser, the adapter SHALL NOT touch `host`, `x-forwarded-host`, or `x-forwarded-proto` — those headers SHALL pass through with their inbound values exactly as they did before this change. The adapter SHALL NOT throw, log, or otherwise observably fail because of the absent or invalid header inside the header-copy helper. The pre-existing behaviour of [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` for absent or invalid `x-ms-original-url` (including any pre-existing crash path from `new Request(originalUrl, …)`) SHALL be preserved as-is — this change SHALL NOT introduce a new crash path beyond that.

#### Scenario: Absent `x-ms-original-url` leaves `host` untouched

- **WHEN** the inbound headers contain `host: internal.azurewebsites.net` and no `x-ms-original-url`
- **THEN** the downstream SvelteKit `Request.headers.get('host')` SHALL be `internal.azurewebsites.net`

#### Scenario: Absent `x-ms-original-url` leaves `x-forwarded-host` untouched

- **WHEN** the inbound headers contain `x-forwarded-host: client-supplied.example` and no `x-ms-original-url`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-host')` SHALL be `client-supplied.example`

#### Scenario: Absent `x-ms-original-url` does not synthesize `x-forwarded-proto`

- **WHEN** the inbound headers contain no `x-forwarded-proto` and no `x-ms-original-url`
- **THEN** the downstream SvelteKit `Request.headers.get('x-forwarded-proto')` SHALL be `null`

#### Scenario: Invalid `x-ms-original-url` does not normalize and does not throw inside the header-copy helper

- **WHEN** the inbound headers contain `x-ms-original-url: not a url`
- **THEN** the header-copy helper SHALL NOT throw
- **AND** the helper SHALL NOT touch the inbound `host`, `x-forwarded-host`, or `x-forwarded-proto` values
- **AND** the existing fallback behaviour of [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` for an unparseable `x-ms-original-url` SHALL be preserved unchanged (this requirement neither adds nor removes that pre-existing behaviour)

### Requirement: Adapter unit coverage exists for the origin-header normalization

The repository SHALL contain unit tests under `tests/unit/` that cover the normalization behaviour directly against the internal header-copy helper, without spinning up the demo or running Playwright. These SHALL be added alongside the existing tests at [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js). The unit tests SHALL cover:

- valid `x-ms-original-url` causes the downstream `host` to equal `originalUrl.host`,
- valid `x-ms-original-url` causes the downstream `x-forwarded-host` to equal `originalUrl.host` whether or not it was already present inbound,
- valid `x-ms-original-url` causes the downstream `x-forwarded-proto` to equal `originalUrl.protocol` without the trailing colon,
- spoofed inbound `x-forwarded-host` and `x-forwarded-proto` are overwritten by the values derived from `x-ms-original-url`,
- unrelated inbound headers (including `Authorization` semantics, `Content-Type`, `X-Custom`, `x-forwarded-for`) are preserved unchanged,
- `x-ms-original-url` itself is not present in the returned downstream headers (regression coverage for the existing exclusion),
- absent `x-ms-original-url` leaves all three normalized headers untouched,
- invalid `x-ms-original-url` (e.g. `"not a url"`) does not throw inside the helper and does not touch the three headers.

No new public API SHALL be introduced to satisfy this requirement; the helper SHALL remain internal to the adapter.

#### Scenario: Valid `x-ms-original-url` overwrites host (unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: https://example.com/foo` and `host: internal.azurewebsites.net`
- **THEN** the downstream headers map SHALL produce `Headers.get('host') === 'example.com'`

#### Scenario: Valid `x-ms-original-url` sets `x-forwarded-host` and `x-forwarded-proto` (unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: https://example.com/foo` and no `x-forwarded-host`/`x-forwarded-proto`
- **THEN** the downstream headers map SHALL produce `Headers.get('x-forwarded-host') === 'example.com'` and `Headers.get('x-forwarded-proto') === 'https'`

#### Scenario: Spoofed inbound forwarded headers are overwritten (unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: https://example.com/foo`, `x-forwarded-host: attacker.example.org`, and `x-forwarded-proto: http`
- **THEN** the downstream headers map SHALL produce `Headers.get('x-forwarded-host') === 'example.com'` and `Headers.get('x-forwarded-proto') === 'https'`

#### Scenario: Unrelated headers preserved (unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: https://example.com/foo`, `Content-Type: application/json`, `X-Custom: bar`, and `x-forwarded-for: 203.0.113.5`
- **THEN** the downstream headers map SHALL preserve all three byte-for-byte

#### Scenario: `x-ms-original-url` excluded from downstream headers (regression, unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: https://example.com/foo`
- **THEN** the downstream headers map SHALL NOT contain an `x-ms-original-url` entry

#### Scenario: Absent `x-ms-original-url` leaves origin headers untouched (unit)

- **WHEN** the unit test invokes the helper with no `x-ms-original-url` and inbound `host: internal.azurewebsites.net`, `x-forwarded-host: client.example`
- **THEN** the downstream headers map SHALL contain `host === 'internal.azurewebsites.net'` and `x-forwarded-host === 'client.example'`
- **AND** the downstream headers map SHALL NOT contain an `x-forwarded-proto` entry

#### Scenario: Invalid `x-ms-original-url` does not throw and does not normalize (unit)

- **WHEN** the unit test invokes the helper with inbound `x-ms-original-url: 'not a url'` and inbound `host: internal.azurewebsites.net`
- **THEN** the helper invocation SHALL NOT throw
- **AND** the downstream headers map SHALL contain `host === 'internal.azurewebsites.net'`
- **AND** the downstream headers map SHALL NOT have set/overwritten `x-forwarded-host` or `x-forwarded-proto`

### Requirement: README documents the origin-header normalization

The README SHALL document that the adapter normalizes `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` from Azure SWA's `x-ms-original-url` so that downstream SvelteKit code sees a consistent public origin. The documentation SHALL state: (a) when normalization fires (whenever `x-ms-original-url` is present and parses as a valid absolute URL); (b) which three headers are written; (c) that any inbound client-provided or stale value of `x-forwarded-host` / `x-forwarded-proto` is overwritten; (d) that absent or invalid `x-ms-original-url` falls back to existing behaviour without normalization.

#### Scenario: README has the origin-header normalization entry

- **WHEN** the README is read
- **THEN** the documentation SHALL contain a section (or paragraph) describing the normalization of `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` from `x-ms-original-url`
- **AND** the section SHALL state that any inbound `x-forwarded-host` / `x-forwarded-proto` is overwritten when `x-ms-original-url` is usable
- **AND** the section SHALL state that absent or invalid `x-ms-original-url` preserves the existing fallback behaviour

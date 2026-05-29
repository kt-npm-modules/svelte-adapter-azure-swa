## Context

Azure Static Web Apps fronts SvelteKit apps deployed via this adapter. SWA terminates the public hostname and proxies the request to a managed Azure Functions backend; from the Functions invocation's point of view the inbound request describes the *internal* hop (`host: <something>.azurewebsites.net`, possibly missing `x-forwarded-host`/`x-forwarded-proto`), while the public URL is supplied separately via the `x-ms-original-url` header. The adapter already takes that into account in [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest`: `Request.url` is built from `x-ms-original-url`, and `x-ms-original-url` is filtered out of the downstream headers by the `buildDownstreamHeaders` helper in [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js).

The remaining inconsistency (issue #218, scope 1) is the origin-identifying headers. Even after `Request.url` is correct, `Request.headers` still carries:
- `host` from the internal Azure Functions hop,
- a possibly missing, stale, or client-spoofed `x-forwarded-host`,
- a possibly missing, stale, or client-spoofed `x-forwarded-proto`.

SvelteKit-internal code and userland hooks/load functions that read `request.headers.get('host')`, `x-forwarded-host`, or `x-forwarded-proto` therefore see a backend-shaped origin while `event.url` is public — a footgun for cookie scoping, OAuth callback URLs, CORS allow-lists, link generation, signed URL verification, etc.

Scope 2 of issue #218 (Authorization) was already shipped by the archived `strip-swa-authorization` change and is owned by the existing `adapter-authorization-policy` capability. This design touches neither.

## Goals / Non-Goals

**Goals:**
- When `x-ms-original-url` is present and parses as a valid absolute URL, normalize the downstream `host`, `x-forwarded-host`, and `x-forwarded-proto` from that URL so `Request.url` and `Request.headers` describe the same public origin.
- Treat `x-ms-original-url` as the trusted source for the public origin (it is already trusted for `Request.url`); deliberately overwrite any client-provided `x-forwarded-host`/`x-forwarded-proto` rather than honour them.
- Keep the change deterministic, pure, and unit-testable directly on the helper — no new I/O, no logging, no time, no env reads.
- Preserve every other header byte-for-byte.
- Preserve existing fallback behaviour when `x-ms-original-url` is absent or invalid; introduce no new crash path beyond what `toRequest` already does today.

**Non-Goals:**
- Do not change Authorization behaviour or `preserveAuthorization`. That is `adapter-authorization-policy`'s concern.
- Do not add new adapter options. The normalization is unconditional whenever `x-ms-original-url` is usable.
- Do not change `Request.url` construction. The existing `new Request(originalUrl, …)` call site is unchanged.
- Do not add new diagnostic routes or new transport headers. Existing demo/e2e diagnostics may be tightened in their assertions but no new endpoint is created.
- Do not modify GitHub Actions workflows.
- Do not normalize other forwarded-* headers (`x-forwarded-for`, `x-forwarded-port`, `forwarded`, etc.). The proposal scopes the contract to `host`, `x-forwarded-host`, `x-forwarded-proto`.

## Decisions

### Decision 1: Put the normalization inside `buildDownstreamHeaders`, not in a new helper

The `x-ms-original-url` exclusion is already centralized in [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js)'s `buildDownstreamHeaders`. The new normalization needs the same input (`x-ms-original-url`) and acts on the same output (the downstream headers map), so it belongs at the same seam. Returning the normalized map keeps `toRequest` in `entry.js` minimal — it still owns `new Request(originalUrl, …)` and is unchanged in behaviour.

**Alternatives considered:**
- *A separate helper next to `buildDownstreamHeaders`.* Rejected: it would force two passes over the headers and an extra import in `entry.js`. The normalization is a one-liner conceptually ("after the copy, set three keys"), and the helper already owns the only other origin-related rule (`x-ms-original-url` exclusion).
- *Doing it in `toRequest`.* Rejected: `toRequest` would have to re-read `x-ms-original-url`, re-`URL.parse` it, and mutate a `Headers` instance after construction. Worse, the unit-coverage layer in [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js) would no longer exercise the normalization without spinning up `entry.js`'s mocked `ENV`/`MANIFEST`/`SERVER`. Keeping the rule in the helper preserves the test seam.

### Decision 2: Parse `x-ms-original-url` separately inside `buildDownstreamHeaders` for header normalization only; leave `Request.url` construction untouched

`entry.js`'s `toRequest` continues to pass the raw `x-ms-original-url` string into `new Request(originalUrl, …)` exactly as today — this change does NOT refactor `Request.url` construction, does NOT route the parsed `URL` from the helper into `toRequest`, and does NOT replace the existing call site. The helper performs its OWN `new URL(...)` parse, locally and only for the purpose of deriving `originalUrl.host` and `originalUrl.protocol` for the three normalized headers. The parse is wrapped in a try/catch so an unparseable value falls back to "no normalization" (see Decision 4). The helper's return shape is unchanged (`{ downstreamHeaders, testWorkaroundsInfo, emptyPostFormContentTypeApplied }`); the parsed `URL` is not exposed.

This means the WHATWG `URL` parser may run twice for one request when `x-ms-original-url` is present and parseable — once inside the helper for header normalization, once inside `new Request(originalUrl, …)` for `Request.url`. That duplication is deliberate: it is the price of leaving the existing `Request.url` construction strictly unchanged, which the proposal mandates.

**Alternatives considered:**
- *Refactor `toRequest` to share the helper's parsed `URL`.* Rejected: out of scope — the proposal explicitly states "Do not change `Request.url` behavior except preserving the existing `x-ms-original-url` construction." Sharing the parse would require routing a `URL` (or pre-built string) from the helper into `toRequest` and rewriting the `new Request(...)` call site, which is a refactor we are not asked to do.
- *Parse only inside `toRequest` and pass `host`/`protocol` strings into the helper.* Rejected: it splits the "trusted public origin" concept across two files, forces `toRequest` to grow new logic, and would couple the unit-testable helper to a caller-provided pre-parse — losing the test seam at [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js).
- *Use string slicing instead of `new URL(...)`.* Rejected: `URL` is the standard, polyfilled (`installPolyfills` runs at module top), and gives us a consistent definition of "host" (host:port, IDN-encoded) and "protocol" (with colon, which we strip).

### Decision 3: `x-forwarded-proto` is the protocol scheme without the trailing colon

`URL.protocol` in WHATWG returns `"https:"` (with colon). The de-facto convention for `X-Forwarded-Proto` (and the `Forwarded` header `proto` directive, RFC 7239) is the bare scheme: `https`, not `https:`. The adapter writes the bare scheme. This matches what reverse proxies emit and what SvelteKit / userland code expects to consume.

### Decision 4: Absent or invalid `x-ms-original-url` → preserve existing fallback, do not normalize, do not throw

Three observable input states and what the helper does in each:

| State                                         | Today's behaviour                                   | New behaviour                                                                 |
| --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Header absent                                 | `originalUrl` is `null`; `new Request(null, …)` runs | unchanged; helper does NOT touch `host`/`x-forwarded-host`/`x-forwarded-proto`|
| Header present, parses as absolute URL        | `Request.url` set to that URL                        | `Request.url` set as today **and** the three headers overwritten              |
| Header present, does NOT parse as absolute URL| `new Request(...)` may throw (existing path)         | helper does NOT touch the three headers; `entry.js` continues to its existing path; no new crash beyond what's there today |

The helper guards the parse with `try { new URL(originalUrl) } catch { /* skip */ }`. It does NOT swallow downstream errors from `entry.js`'s `new Request(originalUrl, …)` — that's an existing crash path the proposal explicitly leaves intact ("must not introduce a new crash path beyond existing behavior").

**Alternatives considered:**
- *Emit a synthetic `host: localhost` when the URL is missing.* Rejected: it would mask real misconfiguration and contradict the goal of "self-consistent with `Request.url`".
- *Throw a typed error on invalid `x-ms-original-url`.* Rejected: out of scope; the proposal forbids new crash paths.

### Decision 5: Always overwrite incoming `x-forwarded-host` and `x-forwarded-proto` when normalizing

When `x-ms-original-url` is present and parseable, we treat it as the trusted public origin and unconditionally overwrite any inbound `x-forwarded-host` / `x-forwarded-proto`. We do NOT honour them as hints. Rationale:

- SWA itself does not reliably set these headers — observed inputs include "missing", "stale" (pointing at a previous hop), and "passed through from the client". Treating any of those as authoritative would defeat the whole point of normalization.
- A client-supplied `x-forwarded-host: attacker.example.com` reaching a function whose only origin signal is "trust the headers" is exactly the spoofing class the proposal calls out. `x-ms-original-url` is set by SWA itself; it is the only origin signal we trust.
- This matches how reverse proxies typically use these headers: the *last* trusted hop overwrites them; we are the last trusted hop.

### Decision 6: Set, not append, on `Host`

`Host` is a request-target header in HTTP/1.1, singular by definition. We use `headers.set('host', …)` rather than appending. Same applies to `x-forwarded-host` / `x-forwarded-proto` — we want a single canonical value, not the comma-joined list semantics that some proxies use.

### Decision 7: Header-name casing — write lowercase

The downstream consumer is a `Headers` instance (which lowercases keys for `get`), so the stored case is observably irrelevant. We write the keys in lowercase (`host`, `x-forwarded-host`, `x-forwarded-proto`) to match the existing convention in [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js) and the rest of the adapter, and to keep diffs to the helper minimal.

## Risks / Trade-offs

- [Userland that read the previous internal `host` and depended on it] → low likelihood (the value was an internal Azure Functions host, not anything app-level), but documented in README so consumers can discover it. No adapter option to opt out — adding one was rejected by the proposal scope.
- [Userland that *honoured* incoming `x-forwarded-host` from clients] → in practice this is a security bug, not a feature, and the new behaviour fixes it. Documented in README.
- [Future drift between `Request.url`'s implicit `URL` parse and the helper's explicit one] → both go through the WHATWG `URL` parser; a value that is valid for one is valid for the other. The try/catch around the helper's parse means a future divergence would degrade to "no normalization" rather than a crash.
- [Confusion with the archived `strip-swa-authorization` change] → mitigated by limiting this proposal's spec to the new `adapter-forwarded-origin` capability and explicitly noting in proposal/design that Authorization is untouched.
- [Demo/e2e diagnostic assertions need updating] → existing routes are kept; only assertions that reference the previous internal `host` are tightened. No new diagnostic route, per scope.

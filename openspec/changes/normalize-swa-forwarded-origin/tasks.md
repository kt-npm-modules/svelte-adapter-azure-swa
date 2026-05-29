## 1. Helper-level: normalize origin headers in `buildDownstreamHeaders`

- [x] 1.1 In [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js), inside `buildDownstreamHeaders`, after the existing copy loop produces `downstreamHeaders`, attempt to read `x-ms-original-url` from `httpRequest.headers` and parse it via `new URL(...)` inside a try/catch. If the header is absent or the parse throws, leave `downstreamHeaders` unchanged and proceed.
- [x] 1.2 When the parse succeeds, set `downstreamHeaders['host'] = originalUrl.host`, `downstreamHeaders['x-forwarded-host'] = originalUrl.host`, and `downstreamHeaders['x-forwarded-proto'] = originalUrl.protocol.replace(/:$/, '')`. Use lowercase keys to match the helper's existing convention. The writes SHALL be unconditional (overwrite any inbound values copied earlier in the loop).
- [x] 1.3 Update the helper's JSDoc (header comment + `@returns` description for `CopyHeadersResult.downstreamHeaders`) to document the normalization: when present and parseable, `x-ms-original-url` causes `host`, `x-forwarded-host`, and `x-forwarded-proto` to be overwritten from the parsed URL; when absent or unparseable, no normalization happens. Cross-reference [openspec/specs/adapter-forwarded-origin/spec.md](openspec/specs/adapter-forwarded-origin/spec.md) once it lands.
- [x] 1.4 Confirm by inspection that `buildDownstreamHeaders` remains pure (no I/O, no logging, no `Date`/`Math.random`, no env reads) and that no part of the new logic depends on `preserveAuthorization` or `testWorkarounds`.

## 2. Entry-level: confirm `toRequest` is unchanged

- [x] 2.1 In [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest`, verify that `originalUrl` is still computed from `httpRequest.headers.get('x-ms-original-url')` and passed to `new Request(originalUrl, …)` exactly as today. No code change is required at this seam — confirm by diff.
- [x] 2.2 Confirm that the existing `x-adapter-test-workarounds` mirroring path is unaffected (the helper still returns the same shape and the new normalization does not feed into `testWorkaroundsInfo`).

## 3. Unit tests — origin-header normalization

- [x] 3.1 In [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js), add a new `describe('buildDownstreamHeaders — origin-header normalization from x-ms-original-url', …)` block.
- [x] 3.2 Test: valid `x-ms-original-url: https://example.com/foo?q=1` with inbound `host: internal.azurewebsites.net` → downstream `Headers.get('host') === 'example.com'`.
- [x] 3.3 Test: valid `x-ms-original-url: https://example.com/foo` with no inbound `x-forwarded-host` → downstream `x-forwarded-host === 'example.com'`. Then with inbound `x-forwarded-host: stale.internal` → still `example.com`.
- [x] 3.4 Test: valid `x-ms-original-url: https://example.com/foo` → downstream `x-forwarded-proto === 'https'` (no trailing colon). Repeat with `http://...` → `'http'`.
- [x] 3.5 Test: spoofed inbound `x-forwarded-host: attacker.example.org` and `x-forwarded-proto: http` with valid `x-ms-original-url: https://example.com/foo` → downstream values are `example.com` / `https`.
- [x] 3.6 Test: `x-ms-original-url: https://example.com:8443/foo` → downstream `host` and `x-forwarded-host` are both `example.com:8443`.
- [x] 3.7 Test: unrelated headers preserved — with valid `x-ms-original-url`, inbound `Content-Type: application/json`, `X-Custom: bar`, and `x-forwarded-for: 203.0.113.5` all pass through byte-for-byte; `x-ms-original-url` itself is excluded from the returned downstream headers (regression coverage of the existing exclusion).
- [x] 3.8 Test: absent `x-ms-original-url` — inbound `host: internal.azurewebsites.net` and `x-forwarded-host: client.example` are passed through unchanged; downstream `x-forwarded-proto` is absent (helper does NOT synthesize it).
- [x] 3.9 Test: invalid `x-ms-original-url: 'not a url'` — calling the helper does not throw, inbound `host` is preserved, and `x-forwarded-host` / `x-forwarded-proto` are NOT set/overwritten.
- [x] 3.10 Test: interaction with `preserveAuthorization: false` — with valid `x-ms-original-url` and inbound `Authorization: Bearer foo`, downstream `authorization` is `null` (existing strip), downstream `host`/`x-forwarded-host`/`x-forwarded-proto` are normalized. Confirms the two policies compose without interference.

## 4. Demo / e2e diagnostics

- [x] 4.1 Inspect existing diagnostic routes under [tests/demo/src/routes/](tests/demo/src/routes/) (especially `diagnostic-headers-nav-fallback` and `diagnostic-headers-rewrite`) and the e2e suite at [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts) to identify any assertion that checks `host`, `x-forwarded-host`, or `x-forwarded-proto`. Do NOT add new diagnostic routes.
- [x] 4.2 Skipped — the diagnostic SvelteKit route only sees the downstream `Request.headers` AFTER the adapter has consumed and excluded `x-ms-original-url`, so any e2e assertion gated on `facts.xMsOriginalUrlPresent` would be effectively dead/silent in the normal pipeline. Tightening is not possible without surfacing the raw inbound state, which would require a new diagnostic surface (out of scope). The capability is covered by the new unit tests in [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js) (group 3.x), which exercise `buildDownstreamHeaders` directly with synthetic `x-ms-original-url` inputs.
- [x] 4.3 No-op: no existing assertion in [tests/demo/e2e/diagnostic-headers.test.ts](tests/demo/e2e/diagnostic-headers.test.ts) was checking the *internal* host on these routes, so nothing to update.

## 5. README documentation

- [x] 5.1 Add a section (or paragraph in the existing options/behaviour area) to the project README documenting the origin-header normalization. Cover: what fires it (`x-ms-original-url` present and parseable), which three headers are written (`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`), the trailing-colon rule for the proto value, that any inbound `x-forwarded-host`/`x-forwarded-proto` is overwritten, and that absent/invalid `x-ms-original-url` falls back to existing behaviour with no normalization.
- [x] 5.2 Cross-reference the existing `preserveAuthorization` README section as a related but separate behaviour (so consumers aren't confused about scope).

## 6. Changeset

- [x] 6.1 Add a changeset (`.changeset/<name>.md`) describing the change: "fix" / "minor" level appropriate to the project's convention, summary referencing the README sections and noting that no public adapter API surface changes.

## 7. Validation

- [x] 7.1 Run `npm run format`.
- [x] 7.2 Run `npm run lint`.
- [x] 7.3 Run `npm run check`.
- [x] 7.4 Run `npm run test:swa --prefix tests/demo`.
- [x] 7.5 Run `openspec validate normalize-swa-forwarded-origin --strict` and resolve any reported issues until validation is clean.

## 8. Pre-merge sanity

- [x] 8.1 Re-read [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js) end-to-end and confirm that the helper still does not depend on the `testWorkarounds` flag for the normalization path (the new logic SHALL run unconditionally when `x-ms-original-url` is present and parseable).
- [x] 8.2 Re-read [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` and confirm that the `originalUrl` source for `new Request(...)` is unchanged — the only change to behaviour comes through `buildDownstreamHeaders`'s returned map.

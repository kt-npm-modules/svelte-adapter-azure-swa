## Why

The adapter already uses `x-ms-original-url` to construct the SvelteKit `Request.url`, then strips that header from the downstream `Request.headers`. But the rest of the inbound headers still describe the internal Azure Functions hop: `host` is the internal `*.azurewebsites.net` host, and `x-forwarded-host` / `x-forwarded-proto` may be missing, stale, spoofed by a client, or pointing at the internal hop. SvelteKit and userland code that read `Request.url` and the origin headers therefore see two contradictory views of the request — the URL is public, but the headers describe the Azure Functions backend. This is the scope-1 half of issue #218; scope 2 (Authorization handling) is owned by the already-archived `strip-swa-authorization` change and is explicitly out of scope here.

## What Changes

- When `x-ms-original-url` is present and parses as a valid absolute URL, the adapter SHALL normalize three downstream origin headers from that same URL before constructing the SvelteKit `Request`:
  - set/overwrite `host` from `originalUrl.host`,
  - set/overwrite `x-forwarded-host` from `originalUrl.host`,
  - set/overwrite `x-forwarded-proto` from `originalUrl.protocol` with the trailing colon stripped.
- Any incoming client-provided or spoofed `x-forwarded-host` / `x-forwarded-proto` SHALL be overwritten by the values derived from `x-ms-original-url`.
- Existing `Request.url` construction from `x-ms-original-url` is preserved unchanged. `x-ms-original-url` continues to be excluded from the downstream headers.
- All other inbound headers are preserved unchanged.
- When `x-ms-original-url` is absent or does not parse as a valid absolute URL, the adapter SHALL preserve the existing fallback behaviour and SHALL NOT attempt host/proto normalization. No new crash path is introduced.
- README and the existing demo/e2e diagnostics document and (where useful) verify the normalized public origin facts. No new adapter option, no new diagnostic route, no GitHub Actions changes.

## Capabilities

### New Capabilities
- `adapter-forwarded-origin`: Defines the adapter's policy for normalizing the downstream origin-identifying headers (`host`, `x-forwarded-host`, `x-forwarded-proto`) from the trusted public `x-ms-original-url`, including the absent/invalid fallback and the interaction with the existing `x-ms-original-url`-driven `Request.url` construction.

### Modified Capabilities
<!-- None. `adapter-authorization-policy` is intentionally untouched: this change does not modify Authorization behaviour, `preserveAuthorization`, the `x-adapter-test-workarounds` payload, or the existing `x-ms-original-url`-driven `Request.url` construction. -->

## Impact

- Code: [src/server/entry/copy-headers.js](src/server/entry/copy-headers.js) (or a small sibling helper) gains the normalization step; [src/server/entry/entry.js](src/server/entry/entry.js)'s `toRequest` continues to drive `Request.url` construction unchanged.
- Tests: [tests/unit/copy-headers.test.js](tests/unit/copy-headers.test.js) gains coverage for the new normalization (valid URL → overwrite host/x-forwarded-host/x-forwarded-proto, spoofed values overwritten, unrelated headers preserved, absent URL → no normalization, invalid URL → no new crash path, `x-ms-original-url` still excluded from downstream headers).
- Demo/e2e: existing diagnostic routes under `tests/demo/` are kept; assertions are updated only where useful to verify the normalized public-origin facts (`event.url` remains public, `host` is the public host, `x-forwarded-host` matches, `x-forwarded-proto` matches).
- Docs: README documents that the adapter normalizes `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` from `x-ms-original-url` so downstream SvelteKit code sees a consistent public origin.
- Public API surface: unchanged. No new adapter option, no new diagnostic route, no GitHub Actions changes.
- Out of scope: Authorization handling, `preserveAuthorization`, and any change to `Request.url` construction beyond preserving the existing `x-ms-original-url` source.

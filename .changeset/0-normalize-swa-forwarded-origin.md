---
'svelte-adapter-azure-swa': minor
---

Normalize the public-origin headers (`Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`) on every SvelteKit request when Azure SWA's `x-ms-original-url` is present.

Azure Static Web Apps proxies to the managed Azure Functions backend, so the inbound `host` describes the internal `*.azurewebsites.net` hop and `x-forwarded-host` / `x-forwarded-proto` may be missing, stale, or client-spoofed — while `Request.url` is already constructed from the trusted `x-ms-original-url`. This change makes the downstream `Request.headers` self-consistent with `Request.url`: when `x-ms-original-url` is present and parses as a valid absolute URL, the adapter unconditionally sets the three origin headers from that URL, overwriting any inbound values. Absent or invalid `x-ms-original-url` falls back to existing behavior with no normalization and no new error path.

No public adapter API changes. `preserveAuthorization` and the `Authorization` strip behavior are unaffected. See the README section "Public-origin header normalization" for details.

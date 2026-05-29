---
'@ktarmyshov/svelte-adapter-azure-swa': minor
---

Strip Azure Static Web Apps injected `Authorization` headers by default before constructing the SvelteKit request.

Azure SWA overwrites or injects its own internal bearer token on managed Function requests, including requests where the client did not send `Authorization`. Exposing that platform token to SvelteKit can break auth/session libraries that treat `Authorization` as client-provided bearer auth.

A new `preserveAuthorization` adapter option is available as an escape hatch. It defaults to `false`; set it to `true` to keep forwarding the raw `Authorization` header unchanged.

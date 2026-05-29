---
'svelte-adapter-azure-swa': minor
---

Normalize Azure Static Web Apps forwarded origin headers from `x-ms-original-url`.

When Azure SWA routes a public request to the managed SvelteKit function, the adapter already uses `x-ms-original-url` to construct the SvelteKit `Request.url`. The adapter now also uses that same trusted URL to normalize downstream origin headers, so `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto` match the public request instead of the internal Azure Functions hop.

If `x-ms-original-url` is absent or invalid, the adapter preserves the previous fallback behavior.

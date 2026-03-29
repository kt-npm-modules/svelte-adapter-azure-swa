---
'@ktarmyshov/svelte-adapter-azure-swa': patch
---

FIX: Restore empty form POST handling in Azure Static Web Apps cloud runtime

- Updated the historical empty POST workaround for the current Azure request shape.
- Fixed a case where Azure could drop `content-type` for empty form submissions, causing SvelteKit form actions to fail with `415 Unsupported Media Type`.
- Scoped the workaround to browser navigation form POST requests so generic POST handling remains unchanged.

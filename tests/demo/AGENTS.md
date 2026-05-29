## Project Configuration

- **Language**: TypeScript
- **Package Manager**: npm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, devtools-json, paraglide, mcp

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

---

## Forwarded-headers diagnostic probe

The route at [src/routes/diagnostic-headers/+server.ts](src/routes/diagnostic-headers/+server.ts) and the test suite at [e2e/diagnostic-headers.test.ts](e2e/diagnostic-headers.test.ts) collect empirical evidence about how Azure Static Web Apps forwards `Authorization` and forwarded/host headers (`host`, `x-ms-original-url`, `x-forwarded-*`, `x-ms-client-principal`) to the managed Function. The probe is the evidence step before the policy fix tracked in:

- [kt-npm-modules/svelte-adapter-azure-swa#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218)
- [geoffrich/svelte-adapter-azure-swa#212](https://github.com/geoffrich/svelte-adapter-azure-swa/issues/212)

### What it measures

Every probe sends the same generated bearer in two headers (`Authorization` + `x-test-authorization`) and a generated UUID in two more (`x-test-probe-id` + `x-test-expected-probe-id`). The route compares them server-side using `crypto.timingSafeEqual` and returns only sanitized facts. The four observable Authorization outcomes the comparator distinguishes per HTTP method:

| Outcome                             | `authorizationPresent` | `testAuthorizationPresent` | `authorizationEqualsTestAuthorization` |
| ----------------------------------- | ---------------------- | -------------------------- | -------------------------------------- |
| **Preserved** (passes through)      | `true`                 | `true`                     | `true`                                 |
| **Overwritten / injected** by SWA   | `true`                 | `true`                     | `false`                                |
| **Stripped** by SWA                 | `false`                | `true`                     | `null`                                 |
| **Custom headers not reaching app** | _any_                  | `false`                    | `null`                                 |

The probe matrix has 10 tests: one Authorization probe per adapter-supported HTTP method (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` — all tested directly, never sampled by proxy) plus three additional `GET` probes for the no-auth baseline, inject-stability, and `X-Forwarded-*` spoofing. The two SWA routing paths the demo exercises are the navigationFallback (`GET`/`HEAD`/`OPTIONS`) and the explicit rewrite (`POST`/`PUT`/`PATCH`/`DELETE` to `/api/sk_render`), so the matrix covers both.

### Per-method delivery channel

- `HEAD` → empty body, sanitized facts as `x-diag-*` response headers (RFC 9110 §9.3.2).
- `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` → JSON body containing the same facts; no `x-diag-*` headers.

When you read a captured snapshot, the channel it came from is implied by the probe key.

### Safety posture

The route is **safe-by-design** for a public/demo environment. It NEVER emits a raw `Authorization`, raw `Cookie`, raw client principal, raw token, full URL with host or query, or arbitrary unknown header value. It emits only:

- presence/equality booleans,
- closed-enum classifications (e.g. `requestUrlHostKind ∈ {public, internal-azure-functions, localhost, unknown}`),
- scheme tokens (`bearer`/`basic`/`digest`/…) computed by a strict fail-closed regex (anything not RFC-shaped yields `null`, never a substring),
- non-secret server-generated identifiers (`requestId`, `timestamp`).

A caller probing the deployed demo only learns back booleans about inputs they themselves sent.

### Run locally (SWA CLI emulator)

```sh
npm run test:swa --prefix tests/demo
```

This expands to `npm run build:swa && PUBLIC_SWA_CLI=true npm run test`, which builds the demo with the adapter and launches `swa start` on port 4280 via the `webServer` block in [playwright.config.ts](playwright.config.ts). Playwright runs the suite against `http://localhost:4280`. The HTML report is at `tests/demo/playwright-report/index.html`; open it with:

```sh
npx --prefix tests/demo playwright show-report tests/demo/playwright-report
```

The 10 sanitized fact attachments are linked from each test under the name `diagnostic-headers/<probe-key>.json` and inlined into the report bundle.

### Run against deployed Azure SWA (CI)

Open a PR against `main`. The `CI` workflow's `swa` job invokes the reusable `CI-SWA` workflow at [.github/workflows/ci-swa.yml](../../.github/workflows/ci-swa.yml). Its `azure` job builds the demo, deploys to a real Azure SWA preview, and runs Playwright with `PLAYWRIGHT_TEST_BASE_URL` set to the deploy step's `static_web_app_url` output. In the GitHub Actions UI find the matrix entry `swa / azure (<node-version>)` and download the `playwright-report-azure-node<v>` artifact — it contains the exact same 10 `diagnostic-headers/*.json` attachments, but captured against real Azure SWA.

### Local vs Azure — local is NOT the source of truth

The local SWA CLI emulator is a Node.js reimplementation of the SWA edge. Its behavior on `Authorization` injection, `host` rewriting, and `x-ms-*` header generation **need not match real Azure**. Local results are **supporting evidence only**. Real Azure SWA deployment results govern the policy decision in #218.

### What to do with the captured facts

When you have both fact sets:

1. Paste the local results and the Azure results side by side into [#218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218), with the per-method `preserved | overwritten | stripped | custom-headers-not-reaching-app` classification visible.
2. Note any disagreement between local and Azure — that disagreement itself is data.
3. Do not change adapter behavior in this change. The follow-up OpenSpec change for the `Authorization` / forwarded-header policy is informed by, and cites, the captured evidence.

# SvelteKit 3 adapter demo

This is a fresh SvelteKit 3 application consuming the local adapter through `file:../..`.
Sentry 11, Paraglide, the Azure Functions output layout and SWA CLI are configured here.
Adapter scenarios live under `/adapter`; `../demo-old` remains a reference until
replacement coverage is also verified in Azure.

## Install independently

Install the adapter's root dependencies first, then this app's dependencies:

```sh
# Repository root
npm ci
cd tests/demo
nvm use
npm ci
npx playwright install chromium
```

The app requires Node >=22.17. Local SWA CLI/Core Tools currently requires Node 22;
`.nvmrc` selects that major even when the root project is developed with Node 24.
Azure Functions Core Tools v4 must also be available as `func` on PATH.

## Development and checks

```sh
npm run dev
npm run check
npm run lint
npm run test:unit -- --run
npm run test:e2e
```

Unit tests include sanitized header diagnostics and the scaffold's server,
browser-component and Storybook projects.
Playwright checks both the raw SSR HTML and the hydrated page. The test scripts disable
Sentry runtime reporting and uploads so automated tests do not create project noise.
Browser installation is explicit, rather than repeated by every E2E invocation.

## Production build and local SWA

```sh
npm run build
npm run build:swa
npm run swa
# Or build and run the adapter suite through SWA/Functions:
npm run test:swa
```

Kit/adapter configuration lives in `vite.config.ts`. Static output goes to `build/static`;
the generated SSR Function goes to `func/sk_render`. `func/package.json` and `host.json`
are maintained by the app because this is a custom API directory. The Azure runtime
configuration defaults to `node:22`, independently of the local build Node version.

For deployment, install the Function's production dependencies before packaging it:

```sh
npm install --omit=dev --prefix func
```

The deployment pipeline and coverage collection will be updated in migration step 8.
Playwright discovers both `e2e/*.test.ts` and the scaffold's colocated `*.e2e.ts`.
It defaults to preview mode; `PUBLIC_SWA_CLI=true` selects SWA. Set
`PLAYWRIGHT_TEST_BASE_URL` for an already running/deployed app. An external URL defaults
to Azure mode; override `PLAYWRIGHT_TARGET=preview` or `swa` for a local external server.
Azure mode requires an external URL and does not start a web server:

```sh
PLAYWRIGHT_TARGET=azure PLAYWRIGHT_TEST_BASE_URL=https://your-app.azurestaticapps.net npm run test:e2e
```

CI alone does not select Azure mode. Preview omits the custom Function and the 16
Azure header probes because Vite bypasses the adapter request wrapper. SWA runs all
40 tests. Diagnostic attachments contain sanitized facts, never raw bearer values.
Playwright writes its HTML report under ignored `playwright-report/`; legacy Istanbul
fixtures/teardown have not been copied into the new V8-based setup.

## Adapter scenarios

Open `/adapter` or use the **Adapter** navigation link. The scaffold's Home, About and
Sverdle pages remain at their original URLs. The root layout uses trailing slashes
for the local SWA static server; adapter pages keep their own stable paths.

| Route                                      | Purpose                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `/adapter/platform`                        | Selected user/principal facts, roles, invocation ID and client-address availability. Raw claims are not returned. |
| `/adapter/methods`                         | All seven supported HTTP methods and request-body preservation.                                                   |
| `/adapter/empty-post-form`                 | Native form action, empty POST and adapter workaround markers.                                                    |
| `/adapter/pg-smoke`                        | Node/CommonJS `pg.Client` import through the server bundle; no database required.                                 |
| `/adapter/diagnostic-headers-nav-fallback` | Sanitized header probes through fallback/catch-all routing.                                                       |
| `/adapter/diagnostic-headers-rewrite`      | The same probes through an explicit SWA rewrite to `/api/sk_render`.                                              |
| `/adapter/sentry`                          | Separate client and server error triggers.                                                                        |

`func/HelloWorld` is a separate Azure Function at `/api/HelloWorld`, with GET query and
POST JSON examples. `func/package.json` loads both custom and generated Functions
with `*/index.js`. `testWorkarounds: true` enables the adapter's sanitized diagnostic
markers for these demo tests; this is not a production application default.

## Sentry

Setup follows the [official Sentry Instrument skill](https://skills.sentry.dev/instrument)
and the [SvelteKit manual setup](https://docs.sentry.io/platforms/javascript/guides/sveltekit/manual-setup/).
The existing demo project is `konstantin-tarmyshov/svelte-adapter-azure-swa`; its public
DSN is the default in `src/env.ts`. Override public settings using `.env.local` if needed
(see `.env.example`). Keep the upload token only in that ignored file or a CI secret:

```dotenv
SENTRY_AUTH_TOKEN=<your-build-upload-token>
```

Vite loads this token for the build plugin; it is not a public env variable or a browser
SDK option. `npm run build` enables source-map upload when a token is available.
Use `SENTRY_DISABLE_UPLOAD=true npm run build` for an offline/no-upload build.
`PUBLIC_SENTRY_ENABLED=false` independently disables runtime SDK reporting.

Server initialization lives in `src/instrumentation.server.ts`; client initialization
lives in `src/hooks.client.ts`. Both use `src/lib/sentry-options.ts`. Server request/error
hooks are composed with Paraglide in `src/hooks.server.ts`. Kit 3 tracing is enabled via
`tracing.server`, with no legacy instrumentation flag or `svelte.config.js`.

The SDK captures errors and tracing (100% in dev, 10% otherwise). Public release/environment
settings are configurable. The Vite plugin uses `adapter: 'other'` and scans both
`build/static` and `func/sk_render` after adapter output is written. Sentry remains an
external server dependency so its runtime initialization can precede the application.

The adapter's `sentryRewriteSourcesFactory(repositoryRoot)` supplies the native
`sourcemaps.rewriteSources` callback. It resolves each source against its own
`context.mapDir` and uploads repository-relative paths such as
`tests/demo/src/hooks.client.ts`. URL and virtual sources are preserved; the helper
performs no output-directory scan or shared source-path caching.

Production upload has been confirmed by the plugin's success message. Client/server
issue ingestion, readable original frames and actual Azure deployment remain to be
verified separately; a successful upload does not establish those results.

For the live error/source-map check, build with reporting enabled and the upload token,
then start the app (Node 22 for SWA):

```sh
PUBLIC_SENTRY_ENABLED=true SENTRY_DISABLE_UPLOAD=false npm run build:swa
npm run swa
```

Visit `/adapter/sentry` at `http://localhost:4280` and trigger both buttons. The UI
reports an error being triggered or an HTTP status; it does not claim Sentry received
anything. In the linked Sentry project verify **Adapter demo: client error** and
**Adapter demo: server error**. Their frames should resolve to
`tests/demo/src/routes/adapter/sentry/+page.svelte` and
`tests/demo/src/routes/adapter/sentry/error/+server.ts`, with the actual throw lines and
source context. The automated E2E tests verify the errors locally with reporting
disabled, so passing them alone does not complete this live check.

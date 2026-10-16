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
Playwright checks both the raw SSR HTML and the hydrated page. Unit tests disable
SDK reporting and uploads. E2E requires a Sentry token and
confirms receipt of both real errors after the button clicks.
Browser installation is explicit, rather than repeated by every E2E invocation.

## Production build and local SWA

```sh
npm run build
npm run build:swa
npm run swa
# Or let Playwright build, upload maps and run the suite through SWA/Functions:
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

CI installs root/demo independently. The local SWA job also runs demo unit tests and backend coverage; the Azure job builds, uploads maps, deploys and runs E2E against the returned URL.
One Playwright config discovers `e2e/*.test.ts` and the scaffold's colocated `*.e2e.ts`.
Sentry event-receipt checks are part of `e2e/sentry.test.ts` in every mode; they never
skip. Missing credentials, wrong build identity or missing events fail the run.

```sh
npm test                # unit/browser tests, then preview E2E
npm run test:preview     # preview E2E only
nvm use
npm run test:swa         # build + map upload + SWA + full E2E
```

Local Playwright runs build with reporting/upload enabled, then start preview or
SWA. Build credentials are removed from the app-server/Functions environment after
upload. The main Node test process reads `SENTRY_AUTH_TOKEN` from `.env.local` or CI
secrets; it never sends the REST token to the browser. Local SWA requires Node 22.

Preview omits the custom Function and 16 Azure header probes because Vite bypasses
the adapter request wrapper; its two Sentry tests still require real event receipt.
SWA runs all 40 tests. Diagnostic attachments contain sanitized facts, never raw
bearer values. Reports are written under ignored `playwright-report/`.
Legacy Istanbul fixtures are not used. Backend V8 coverage retains the CDP flush/report flow from the previous demo.

### Backend coverage through local SWA

```sh
nvm use
npm run coverage
```

This runs the same full SWA E2E suite, including both mandatory Sentry receipts.
The build writes V8 data to repository-root `coverage-v8`; the Function worker uses
`func/coverage-v8` from `func/local.settings.json`. Playwright removes the inherited
build coverage variable when starting SWA so the worker keeps its separate output.
The local inspector on port 9230 lets `e2e/coverage-teardown.ts` flush coverage before
Playwright stops the worker. Coverage runs fail if that flush or either input phase
is missing. External/Azure E2E never connects to a local inspector.

`monocart-coverage-reports` belongs to this demo's devDependencies.
`scripts/report-swa-coverage.ts` combines both phases and writes repository-root
`coverage-swa/lcov.info`, preserving repository-relative source paths for CI/Sonar.
The worker settings retain the previous demo's local inspector/coverage behavior;
they are not deployed Azure runtime settings.

### E2E after Azure deployment

The Azure CI job uses `azure-e2e` and a release derived from the commit, workflow run/attempt and build Node version. Build, map upload and deployed E2E share those values. It selects managed Functions `node:22` separately from the build Node matrix. The platform E2E checks the actual server Node version is 22 and at least 22.17.

Build/deploy once with runtime reporting enabled and a known release/environment.
For example, set these in the build/deployment job (the token remains a secret):

```sh
PUBLIC_SENTRY_ENABLED=true PUBLIC_SENTRY_RELEASE=<build-id> PUBLIC_SENTRY_ENVIRONMENT=azure SENTRY_RELEASE=<build-id> PUBLIC_SWA_CLI=false npm run build
```

Deploy that exact static/Function output, then run the same E2E with the deployed
build's values:

```sh
PUBLIC_SENTRY_RELEASE=<build-id> PUBLIC_SENTRY_ENVIRONMENT=azure PLAYWRIGHT_TEST_BASE_URL=https://your-app.azurestaticapps.net npm run test:azure
```

An external URL starts no local build/server and performs no upload. Release and
environment are required so the API checks can reject an old/wrong deployment. Each
test generates a fresh correlation nonce, allowing repeated E2E runs on the same
release. `CI=true` alone does not select Azure. To test an already running local
server, supply the external URL and explicitly select `PLAYWRIGHT_TARGET=swa` or
`preview`, with the same build release/environment.

The real Azure deployment/job wiring remains in step 8. The external-URL branch can
also be exercised against an already running local app; that is not evidence of
Azure-specific header/runtime behavior.

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

Production upload and both client/server event receipts have been confirmed.
Automated original-frame/source-context checks and actual Azure deployment remain
to be verified; event receipt alone does not establish those results.

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
source context. E2E automatically verifies receipt of both errors after the clicks. Source location
and context assertions are still a separate open check.

### Sentry assertions in the regular E2E suite

After each existing button click, `e2e/sentry.test.ts` obtains the SDK's actual
`event_id` and queries it through official `@sentry/api` on `https://de.sentry.io`.
It checks the exact exception text, event identity, side/request tags, and the tested
build's release/environment. It polls for up to 90 seconds per event with bounded
backoff and `Retry-After` handling; 401/403 fail immediately. Logs include only IDs and
safe status summaries, not tokens or raw event payloads.

The client test supplies a non-secret `sentry_test_run` query nonce. SDK `beforeSend`
observes the existing automatic capture, tags that event and exposes its ID through
an HTML data attribute. The server button forwards the nonce in a test header;
request-local `AsyncLocalStorage` keeps captures isolated and returns the exact event
ID in a response header. This does not add a second capture. No build-time test flag
or fixed per-build test nonce is needed, so the same code works after deployment.
Requests without a valid probe nonce do not expose a test event-ID marker.

`@sentry/api` is pinned to 0.359.0 because its API is still 0.x. Its
FSL-1.1-Apache-2.0 license was reviewed for this internal test-tool use; it remains a
demo-only devDependency, outside the published MIT adapter and browser bundle.

The separate `test:sentry:live` runner/config/test were removed. E2E requires
`SENTRY_AUTH_TOKEN` with `project:read`; local map uploads additionally need `org:ci`.
Unit tests stay offline and do not report errors. CI E2E jobs must provide the same
required credentials; there is no missing-token skip.

Event ingestion is asserted automatically. Original-path/line/source-context and
source-map-debug assertions remain deferred in TODO. A previous upload-enabled run
confirmed correct client symbolication through the API, while the local server's raw
stack was already mapped and lacked the desired repository-relative prefix. Azure
and automated server symbolication checks remain necessary.

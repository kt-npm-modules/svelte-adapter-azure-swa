# SvelteKit 3 adapter demo

This is a fresh SvelteKit 3 application consuming the local adapter through `file:../..`.
Paraglide, the Azure Functions output layout and SWA CLI are configured here.
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
browser-component and Storybook projects. Playwright checks both the raw SSR HTML
and the hydrated page. Browser installation is explicit, rather than repeated by
every E2E invocation.

## Production build and local SWA

```sh
npm run build
npm run build:swa
npm run swa
# Or let Playwright build and run the suite through SWA/Functions:
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

CI installs root/demo independently. The local SWA job also runs demo unit tests and backend coverage;
the Azure job builds, deploys and runs E2E against the returned URL.
One Playwright config discovers `e2e/*.test.ts` and the scaffold's colocated `*.e2e.ts`.

```sh
npm test                # unit/browser tests, then preview E2E
npm run test:preview     # preview E2E only
nvm use
npm run test:swa         # build + SWA + full E2E
```

Local SWA requires Node 22. Preview omits the custom Function and Azure header
probes because Vite bypasses the adapter request wrapper. SWA runs all remaining
E2E tests, including the PostgreSQL smoke test. Diagnostic attachments contain
sanitized facts, never raw bearer values. Reports are written under ignored
`playwright-report/`. Legacy Istanbul fixtures are not used. Backend V8 coverage
retains the CDP flush/report flow from the previous demo.

### Backend coverage through local SWA

```sh
nvm use
npm run coverage
```

This runs the same full SWA E2E suite, including the PostgreSQL smoke check.
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

The Azure CI job builds with managed Functions runtime `node:22`, deploys the
generated static and Function output, then runs Playwright against the returned
URL. The platform E2E verifies the actual server Node version.

To test an existing Azure deployment:

```sh
PLAYWRIGHT_TEST_BASE_URL=https://your-app.azurestaticapps.net npm run test:azure
```

An external URL starts no local build or server. `CI=true` alone does not select
Azure. To test an already running local server, supply the external URL and
explicitly select `PLAYWRIGHT_TARGET=swa` or `preview`.

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

`func/HelloWorld` is a separate Azure Function at `/api/HelloWorld`, with GET query and
POST JSON examples. `func/package.json` loads both custom and generated Functions
with `*/index.js`. `testWorkarounds: true` enables the adapter's sanitized diagnostic
markers for these demo tests; this is not a production application default.

## Sentry isolation experiment

This experimental branch removes Sentry instrumentation, error-reporting routes,
dependencies and dedicated tests. It also intentionally omits
`ssr.external: ['pg']`. The `/adapter/pg-smoke` endpoint is retained unchanged so
the PostgreSQL CommonJS bundling behavior can be compared against the original
Sentry-enabled Azure build.

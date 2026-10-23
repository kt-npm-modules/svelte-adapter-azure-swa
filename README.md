[![NPM Version](https://img.shields.io/npm/v/%40ktarmyshov%2Fsvelte-adapter-azure-swa)](https://www.npmjs.com/package/@ktarmyshov/svelte-adapter-azure-swa)
[![CI](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=coverage)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![License](https://img.shields.io/npm/l/@ktarmyshov/svelte-adapter-azure-swa)](./LICENSE)

# SvelteKit 3 adapter for Azure Static Web Apps

`@ktarmyshov/svelte-adapter-azure-swa` deploys SvelteKit 3 applications to **Azure Static Web Apps (SWA)**. It serves server-side rendering (SSR) through SWA-managed **Azure Functions**, alongside prerendered pages and static assets.

The adapter integrates with SvelteKit's Vite configuration, bundles the server with Rolldown, supports server instrumentation, and exposes Azure request context through `event.platform`. Its Azure-specific routing and request behavior are covered by local and deployed Azure tests.

- **SvelteKit 3 only:** this adapter's `3.x` line does not support SvelteKit 2.
- **One SWA deployment:** static assets, prerendered pages and an Azure Functions SSR renderer.
- **Azure-aware behavior:** request headers, authentication context and empty form submissions.
- **Observability:** SvelteKit instrumentation and Sentry source-map integration.

## Compatibility

| Requirement                   | Supported contract                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Adapter                       | `3.x` for SvelteKit 3                                                               |
| SvelteKit and Azure Functions | See [peerDependencies](package.json) (Azure Functions Node.js programming model v4) |
| Build Node.js                 | See [engines](package.json)                                                         |
| Managed SWA API runtime       | `node:22`                                                                           |

The adapter generates `platform.apiRuntime: 'node:22'`. The build machine's Node version does not select the deployed Azure runtime. For framework prerequisites, see the [SvelteKit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3). SWA's [managed API constraints](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview#api-constraints), including request-duration limits and lack of WebSockets, still apply.

## Quick Start

Start from an existing SvelteKit 3 application. Install the adapter and the Azure Functions SDK (check the [peer dependency range](package.json) for the minimum supported version):

```sh
npm install -D @ktarmyshov/svelte-adapter-azure-swa@3 @azure/functions@^4
```

Configure `vite.config.ts`:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter() })]
});
```

For Azure platform types in application code, add to `src/app.d.ts`:

```ts
/// <reference types="@ktarmyshov/svelte-adapter-azure-swa" />
```

Build the application:

```sh
npm run build
```

The default output is:

```text
build/
├── server/                    # Azure Functions API
│   ├── sk_render/             # SSR function entry and server chunks
│   ├── host.json
│   ├── local.settings.json
│   ├── .funcignore
│   └── package.json
└── static/                    # Static SWA content
    ├── _app/
    ├── staticwebapp.config.json
    └── ...                    # Assets and prerendered pages
```

The adapter generates the API manifest but **does not install its runtime dependencies**. Install them before deployment.

## Deploy to Azure Static Web Apps

Create an Azure Static Web App and save its deployment token as the GitHub Actions secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. For an application at the repository root using the default directories, create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure Static Web Apps

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: npm
      - name: Install application dependencies
        run: npm ci
      - name: Build application
        run: npm run build
      - name: Install Function production dependencies
        run: npm install --omit=dev --prefix build/server
      - name: Upload prebuilt application and Functions
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: upload
          app_location: ./build/static
          api_location: ./build/server
          output_location: ''
          skip_app_build: true
          skip_api_build: true
```

This workflow builds the application, installs the Function's production dependencies, then uploads the **prebuilt** static and API output. Because the generated API manifest has no lockfile, use `npm install --omit=dev` rather than `npm ci` inside `build/server`. Azure documents these [prebuilt deployment settings](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration#skip-building-front-end-app).

For a custom output directory, update both the dependency-install command and the corresponding action path. For a project in a repository subdirectory, run npm commands there and adjust all paths relative to the repository root.

See the repository's [Azure CI workflow](.github/workflows/ci-swa.yml) for a tested deployment using a user-managed API directory.

## Adapter configuration

Pass options through `sveltekit({ adapter: adapter({ ... }) })`. The [`Options` type](src/index.d.ts) is the source of truth.

| Option                     | Default        | Purpose                                                                        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `apiDir`                   | `build/server` | API output; explicitly setting it makes the surrounding directory user-managed |
| `staticDir`                | `build/static` | Static and prerendered output                                                  |
| `external`                 | `[]`           | Additional packages excluded from the server bundle                            |
| `customStaticWebAppConfig` | `{}`           | Additional SWA configuration and routes                                        |
| `allowReservedSwaRoutes`   | `false`        | Suppress the build-time `/api` route check; does not change Azure routing      |
| `emulate`                  | Anonymous      | Local platform identity or a synchronous provider                              |
| `preserveAuthorization`    | `false`        | Forward the inbound Authorization header instead of stripping it               |
| `debug`                    | `false`        | Enable Function request/response diagnostics                                   |
| `testWorkarounds`          | `false`        | Expose sanitized compatibility diagnostics for tests                           |
| `serverRolldown`           | Not set        | Customize the server Rolldown configuration                                    |

`debug`, `testWorkarounds` and `preserveAuthorization` are compiled into the server output; rebuild after changing them. Keep diagnostics off unless needed; debug logs may contain request data.

### Output ownership

With `adapter()`, the adapter generates the entire `build/server` API scaffold. With `adapter({ apiDir: 'func' })`, it regenerates only `func/sk_render`; supply `func/package.json`, `host.json` and any sibling Functions yourself. Even explicitly setting `apiDir: 'build/server'` selects user-managed API ownership.

Treat static build output as disposable. When customizing `apiDir` without specifying `staticDir`, clean `build/static` before deployment to avoid retaining old files; the cleanup edge case is tracked in [issue #341](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/341). Keep custom source and configuration outside disposable static output.

### Routing

The adapter generates `staticwebapp.config.json` with:

- `/api/*` and `/data-api/*` reserved for their Azure backends;
- POST, PUT, PATCH and DELETE rewrites to `/api/sk_render`;
- a navigation fallback for server-rendered paths;
- immutable caching for SvelteKit's versioned assets.

Do not put SvelteKit endpoints under `/api`: Azure reserves that namespace. For custom SWA routes, add them through `customStaticWebAppConfig`. They precede generated rules and can shadow them; when a custom route needs SvelteKit, rewrite to `/api/sk_render`. The adapter does not allow overriding `navigationFallback` or defining a literal `'*'` route.

Azure's [routing and authorization rules](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration#routes) are not a substitute for application-level authorization. In particular, route rules do not govern requests processed by `navigationFallback`.

### External dependencies

Rolldown bundles the server, while `@azure/functions` and `fsevents` are always external. Add further packages using, for example, `adapter({ external: ['@sentry/sveltekit'] })`.

For the **generated** API scaffold, an extra external dependency is copied into its `package.json` only when its exact package name appears in the application's `dependencies`. With a custom `apiDir`, maintain runtime dependencies in that directory's own manifest. In both cases, install them before deploying.

Vite `ssr.external` applies to SvelteKit's earlier SSR build; the adapter's `external` applies to the subsequent Azure Function bundle. They are not interchangeable.

## Azure Functions and platform behavior

The generated API scaffold uses the `@azure/functions` range in the [template manifest](src/server/template/package.json), which Dependabot maintains. Its `host.json` has a schema `"version": "2.0"`; that is **not** the Functions programming model version. Set production environment variables through [SWA application settings](https://learn.microsoft.com/en-us/azure/static-web-apps/application-settings), not `local.settings.json`.

For sibling Azure Functions, configure `apiDir: 'func'` and use a manifest such as:

```json
{
	"private": true,
	"type": "module",
	"main": "*/index.js",
	"dependencies": {
		"@azure/functions": "^4"
	}
}
```

Check the adapter's [peer dependencies](package.json) for the minimum supported SDK version, and install the manifest's runtime dependencies with `npm install --omit=dev --prefix func`. The `*/index.js` pattern loads the generated `sk_render` wrapper and sibling v4 Function registrations; do not mix v3 `function.json` registrations with the v4 programming model in one app. The [demo](tests/demo/func/package.json) includes a sibling `HelloWorld` Function.

### Requests and authentication

SvelteKit server requests expose `platform.context` (Azure invocation context), `platform.user` (nullable Azure SDK user) and `platform.clientPrincipal` (nullable SWA client principal). The adapter also implements `getClientAddress()`.

- **Authorization:** by default, the adapter strips the inbound `Authorization` header because SWA can overwrite or inject it. `preserveAuthorization: true` forwards what reaches the Function; it cannot recover a caller token replaced upstream. See [issue #218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218).
- **Public origin:** request URLs and downstream `host` / `x-forwarded-*` origin headers are derived from SWA's `x-ms-original-url`. This renderer requires that header; it is not a standalone direct-Functions adapter.
- **Empty forms:** if Azure strips the content type from an empty native form POST, the adapter restores `application/x-www-form-urlencoded` for the matching navigation request.

SWA handles its configured sign-in and route access rules; application code remains responsible for authorization. The [Azure user-information documentation](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information#api-functions) explains which principal information reaches managed APIs.

## Local development

`npm run dev` and `npm run preview` use SvelteKit's platform emulation; they do not run the generated Function or sibling Functions. For full local SWA routing, use [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) and [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) with Node 22:

```sh
npm install -D @azure/static-web-apps-cli
npm run build
npm install --omit=dev --prefix build/server
npx --no-install swa start ./build/static --api-location ./build/server
```

For more involved setups (including a custom API directory), see the [demo configuration](tests/demo/swa-cli.config.json) and [demo instructions](tests/demo/README.md). Passing local SWA tests does not guarantee identical behavior in Azure, especially for headers.

To emulate an authenticated platform in Vite development, use `adapter({ emulate: { role: 'authenticated' } })`. For custom users, `emulate.clientPrincipal` accepts a principal or `null`; `emulate` also accepts a synchronous `() => EmulateState` provider. Emulation is not an authentication system.

## Instrumentation and Sentry

SvelteKit 3's `src/instrumentation.server.ts` is supported without an experimental flag. To collect server tracing spans, enable `tracing: { server: true }` in `sveltekit({ ... })` and configure your tracing SDK. See [SvelteKit observability](https://svelte.dev/docs/kit/observability).

For Sentry 11, follow the [official SvelteKit setup](https://docs.sentry.io/platforms/javascript/guides/sveltekit/). The repository [demo dependencies](tests/demo/package.json) show the SDK version currently tested. Install Sentry as an application runtime dependency:

```sh
npm install @sentry/sveltekit@^11
```

A minimal adapter-specific Vite configuration for the default output directories:

```ts
import adapter, { sentryRewriteSourcesFactory } from '@ktarmyshov/svelte-adapter-azure-swa';
import { sentrySvelteKit } from '@sentry/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		build: { sourcemap: true },
		plugins: [
			sentrySvelteKit({
				adapter: 'other',
				org: 'your-org',
				project: 'your-project',
				authToken: env.SENTRY_AUTH_TOKEN,
				autoUploadSourceMaps: Boolean(env.SENTRY_AUTH_TOKEN),
				sourcemaps: {
					assets: ['./build/static/**', './build/server/sk_render/**'],
					rewriteSources: sentryRewriteSourcesFactory(import.meta.dirname)
				}
			}),
			sveltekit({
				tracing: { server: true },
				adapter: adapter({ external: ['@sentry/sveltekit'] })
			})
		]
	};
});
```

Initialize the SDK and error hooks as described by Sentry. Keep `SENTRY_AUTH_TOKEN` in an ignored environment file or CI secret. The Sentry build plugin handles map uploads; the adapter does not upload them. With a custom `apiDir`, declare `@sentry/sveltekit` in its runtime dependencies. The [complete demo](tests/demo/vite.config.ts) shows the tested instrumentation and upload configuration.

`sentryRewriteSourcesFactory(repositoryRoot)` makes Sentry map paths relative to your repository using the callback's `context.mapDir`. For a monorepo app, pass the actual repository root instead of `import.meta.dirname`. Client source maps may remain publicly accessible in the static output; configure Sentry's post-upload map deletion if required. Upload and event receipt alone do **not** guarantee complete production symbolication.

## Advanced configuration and troubleshooting

`serverRolldown(options)` receives a deep clone of the adapter's Rolldown options and **must return** a configuration object. Preserve adapter-owned inputs and aliases when extending it; the adapter restores its own output settings. See the [option type](src/index.d.ts) and implementation in [`src/server/index.js`](src/server/index.js). Additional externals configured here are **not** copied automatically to the generated API manifest.

| Symptom                                        | Check                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Renderer cannot start or a module is missing   | Install API production dependencies; verify custom API `package.json` / `host.json`   |
| App or API missing after deployment            | Check prebuilt `app_location`, `api_location`, `output_location` and skip-build flags |
| `/api` endpoint works locally but not in Azure | Move the SvelteKit route outside Azure's reserved API namespace                       |
| Form actions or custom routes fail             | Check custom-route precedence and renderer rewrites                                   |
| Authorization differs between local and Azure  | Check [header policy](#requests-and-authentication)                                   |
| Prerendered routes loop in SWA CLI             | Review local `trailingSlash` behavior in the [demo](tests/demo/README.md)             |

### Migrating from adapter 2.x

Upgrade the app to **SvelteKit 3** and meet this adapter's [peer dependencies](package.json) and [Node engine requirement](package.json). Move the adapter configuration to `sveltekit({ adapter: adapter(...) })` in `vite.config.ts`, following the [SvelteKit migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3). Review output-directory ownership and reinstall Function production dependencies. If you use server customization or Sentry, update `serverRolldown` callbacks and the source-map helper to their 3.x contracts.

## Acknowledgements

Based on the [original Azure SWA adapter](https://github.com/geoffrich/svelte-adapter-azure-swa). Thanks to [@sukeshpabolu](https://github.com/sukeshpabolu) for the Node 22 / Rolldown migration and the project's first external contribution.

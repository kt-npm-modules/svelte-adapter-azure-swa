[![NPM Version](https://img.shields.io/npm/v/%40ktarmyshov%2Fsvelte-adapter-azure-swa)](https://www.npmjs.com/package/@ktarmyshov/svelte-adapter-azure-swa)
[![CI](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=coverage)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![License](https://img.shields.io/npm/l/@ktarmyshov/svelte-adapter-azure-swa)](./LICENSE)

# SvelteKit 3 adapter for Azure Static Web Apps

`@ktarmyshov/svelte-adapter-azure-swa` deploys SvelteKit 3 applications to Azure Static Web Apps (SWA), with server-side rendering (SSR), prerendered pages and static assets in one deployment. It packages the SvelteKit server as an Azure Functions HTTP renderer and generates the static output and SWA routing configuration.

- [Overview & Compatibility](#overview--compatibility)
- [Quick Start](#quick-start)
- [Deploy to Azure Static Web Apps](#deploy-to-azure-static-web-apps)
- [Configuration](#configuration)
- [Azure Functions & Platform](#azure-functions--platform)
- [Local Development](#local-development)
- [Instrumentation & Observability](#instrumentation--observability)
- [Advanced, Troubleshooting & Migration](#advanced-troubleshooting--migration)

## Overview & Compatibility

The adapter prepares a deployment for SWA's managed Azure Functions backend:

- Bundles the SvelteKit server with Rolldown and registers the `sk_render` HTTP Function.
- Copies SvelteKit's client assets and prerendered pages, and generates `staticwebapp.config.json` with renderer rewrites and immutable-asset caching.
- Implements SvelteKit's server instrumentation contract and exposes Azure request context through `App.Platform`.
- Supplies local platform emulation and compatibility handling for confirmed Azure request-header and empty-form behavior.

Rendering, form actions and prerendering are SvelteKit features. The adapter connects them to Azure Functions and the SWA deployment layout.

| Contract                               | Supported version              |
| -------------------------------------- | ------------------------------ |
| Adapter release line                   | `3.x` (SvelteKit 3 only)       |
| `@sveltejs/kit` peer                   | `3.x` — see peerDependencies   |
| `@azure/functions` peer                | Node.js programming model `v4` |
| Package Node.js engine                 | `>=22.17.0`                    |
| Deployed SWA API runtime               | `node:22`                      |
| Azure Functions Node programming model | v4                             |

The build machine's Node version does not select Azure's runtime. The adapter generates `platform.apiRuntime: 'node:22'`; local SWA CLI/Core Tools also currently requires Node 22. See [Local Development](#local-development) for those additional tools. Other framework prerequisites follow the [SvelteKit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3).

This targets SWA-managed HTTP Functions. Azure's [API constraints](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview#api-constraints), including request-duration limits and lack of WebSocket support, still apply.

## Quick Start

Start with an existing SvelteKit 3 application. Run these commands from its root, where `npm run build` runs `vite build`.

### Install and configure

```sh
npm install -D @ktarmyshov/svelte-adapter-azure-swa@3 @azure/functions@^4.16.5
```

Replace your existing adapter in `vite.config.ts`, preserving the rest of your application's configuration:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter() })]
});
```

If your application uses Azure platform types, add this reference to `src/app.d.ts`:

```ts
/// <reference types="@ktarmyshov/svelte-adapter-azure-swa" />
```

### Build

```sh
npm run build
```

With no directory options, the adapter generates:

```text
build/
├── server/                     # Azure Functions deployment root
│   ├── sk_render/
│   │   ├── index.js            # Function registration wrapper
│   │   ├── entry.js
│   │   └── ...                 # Server chunks, maps and optional instrumentation
│   ├── .funcignore
│   ├── host.json
│   ├── local.settings.json
│   └── package.json
└── static/                     # SWA static deployment root
    ├── _app/
    ├── staticwebapp.config.json
    └── ...                     # Static assets and prerendered pages
```

The build generates the Function manifest but does not install its runtime dependencies. Complete that step before deployment.

## Deploy to Azure Static Web Apps

Create an Azure Static Web App and store its deployment token in the GitHub repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. The example below assumes an application and committed npm lockfile at the repository root, the default adapter directories, and production deployment from `main`.

Create `.github/workflows/deploy.yml`:

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

Build independently, then upload the artifacts. This makes the build environment explicit and avoids delegating build detection to Azure/Oryx. The generated API always needs `@azure/functions`, even without additional externals. Its newly generated manifest has no lockfile, so the API install uses `npm install --omit=dev`, rather than `npm ci`.

With `skip_app_build: true`, `app_location` is the static output directory and `output_location` is empty. With `skip_api_build: true`, `api_location` must contain the built Functions and installed production dependencies. The generated SWA configuration is already in the static output and selects `node:22`. See [Azure's prebuilt deployment instructions](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration#skip-building-front-end-app).

For a custom API directory, change both the production-dependency install destination and `api_location`. Change `app_location` when setting `staticDir`. For applications in a repository subdirectory, run the build/install commands there, adjust action paths relative to the repository root, and point the npm cache at the application's lockfile.

The repository's [Azure workflow](.github/workflows/ci-swa.yml) demonstrates the same build/install/upload sequence with the demo's user-managed `func` directory. Its test infrastructure and deployment cleanup are specific to this repository.

## Configuration

Pass options to `adapter({...})` inside `sveltekit({...})` in your Vite configuration. The public [`Options` type](src/index.d.ts) declares all ten options:

| Option                     | Default                  | Behavior                                                                                                                                            |
| -------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiDir`                   | `'build/server'`         | Functions output root. Supplying this option selects user-managed API configuration, even when its value equals the default path.                   |
| `staticDir`                | `'build/static'`         | Destination for static assets, prerendered output and generated SWA configuration. Use a disposable build directory.                                |
| `external`                 | `[]` additional entries  | Adds dependencies to the adapter's server-bundle externals. See [External dependencies](#external-dependencies).                                    |
| `customStaticWebAppConfig` | `{}`                     | Extends generated SWA configuration; custom routes precede generated routes.                                                                        |
| `allowReservedSwaRoutes`   | `false`                  | Suppresses the build-time `/api` route check when `true`; does not change Azure routing.                                                            |
| `emulate`                  | Anonymous platform state | A static `EmulateState` or synchronous `() => EmulateState` provider. See [Platform emulation](#platform-emulation).                                |
| `preserveAuthorization`    | `false`                  | Preserves the Function's inbound Authorization header when `true`; otherwise strips it before SvelteKit sees it.                                    |
| `debug`                    | `false`                  | Enables generated Function request/response logging.                                                                                                |
| `testWorkarounds`          | `false`                  | Adds workaround diagnostic facts to the internal request and `x-adapter-test-workarounds` response header. It does not enable the underlying fixes. |
| `serverRolldown`           | No callback              | Receives a deep clone of the server configuration and must explicitly return `RolldownOptions`. See [Server bundling](#server-bundling).            |

`debug`, `testWorkarounds` and `preserveAuthorization` are written into the server build; rebuild after changing them.

### Output ownership and cleanup

**Static output directories are disposable build destinations. Do not store unrelated files there.** The adapter cleans old output before writing a new build so stale hashed assets and chunks are not deployed alongside the current application. An explicitly configured `staticDir` is removed recursively. The default `build` tree can also be removed during a build; reserve it for build artifacts.

API ownership depends on whether `apiDir` is supplied:

| Configuration                         | Ownership                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `adapter()`                           | Regenerates `build/server` and its Azure Functions scaffold.                                      |
| `adapter({ apiDir: 'func' })`         | Regenerates `func/sk_render`; the surrounding API directory is user-managed.                      |
| `adapter({ apiDir: 'build/server' })` | Also user-managed: regenerates only `build/server/sk_render`, without supplying the API scaffold. |

Keep custom API source/configuration outside the static output directory. See [Custom API directories and sibling Functions](#custom-api-directories-and-sibling-functions) for the required files.

### Routing and custom SWA configuration

The adapter writes `staticwebapp.config.json` into the static destination. Its generated rules:

- Leave `/api/*` and `/data-api/*` to their Azure backends.
- Rewrite POST, PUT, DELETE and PATCH requests to `/api/sk_render`.
- Use `navigationFallback` to render requests that do not resolve to static files.
- Apply long-lived immutable caching to the SvelteKit immutable-asset path, including any configured base path.

When `/` is not prerendered, it also writes an empty `index.html` required by SWA and rewrites `/` and `/index.html` to the renderer. The empty file is a deployment placeholder, not the application's rendered page.

Extend the configuration through the adapter rather than editing its generated file. For example, an explicit rewrite for a server-rendered endpoint:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				customStaticWebAppConfig: {
					routes: [{ route: '/status', rewrite: '/api/sk_render' }]
				}
			})
		})
	]
});
```

Custom route rules are prepended. Azure stops at the first matching rule, so custom rules can shadow the generated method rewrite. Include a renderer rewrite when your custom rule needs to send a request to SvelteKit. The adapter rejects `navigationFallback` and the literal route `'*'` in custom configuration; this is not validation of every potentially conflicting rule.

Azure documents additional [routing and authorization semantics](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration#routes), including that route rules are not applied to requests triggering `navigationFallback`. Configure protection for the actual request paths and enforce application authorization before returning sensitive data. Azure's `globalHeaders` also excludes API responses; set headers for SvelteKit responses in your server hooks when needed.

### Reserved `/api` paths

Azure reserves `/api` and `/api/*` for its API backend. Put SvelteKit endpoints at other paths, such as `/orders`, and use `/api/HelloWorld` for a separate Azure Function. A Kit `/api` endpoint can work in Vite development but fail to reach Kit after deployment.

The adapter rejects route IDs beginning with `/api` by default. `allowReservedSwaRoutes: true` only suppresses that check; it does not make the namespace available to SvelteKit or comprehensively validate other Azure-reserved paths.

### External dependencies

The adapter bundles the server with Rolldown, always including `fsevents` and `@azure/functions` in its external list. Add other packages with `external: ['package-name']`.

For the generated API scaffold, only exact package names present in **both** the adapter's `external` array and the application's `dependencies` are copied into the generated API manifest. Entries from `devDependencies`, Vite `ssr.external`, or externals added through `serverRolldown` are not automatically copied. The template already supplies `@azure/functions`; the API manifest is not a copy of your application's manifest.

With an explicit `apiDir`, maintain all runtime dependencies in that directory's own `package.json` and install them before deployment.

Vite `ssr.external` controls SvelteKit's SSR build. The adapter's `external` controls the subsequent Azure Function bundling stage. Configuring one is not a substitute for configuring the other.

## Azure Functions & Platform

### Generated API scaffold

Without `apiDir`, the adapter supplies an ESM `package.json` loading `sk_render/index.js`, plus `host.json`, local settings and `.funcignore`. The template currently declares `@azure/functions: ^4.7.0`; this is separate from the adapter's consumer peer requirement `^4.16.5`. Install the generated manifest's production dependencies after each build.

`host.json` uses the configuration schema value `"version": "2.0"`; this is distinct from the Node programming model v4 and Functions host runtime v4. `local.settings.json` supplies local emulator settings, not production application settings. The renderer initializes the Kit server with `process.env`; configure application-specific production variables in [SWA application settings](https://learn.microsoft.com/en-us/azure/static-web-apps/application-settings).

### Custom API directories and sibling Functions

For custom Functions, configure `apiDir: 'func'` in the adapter options of your Vite configuration. Supply the surrounding API files yourself:

```text
func/
├── HelloWorld/
│   └── index.js                 # Your v4 HTTP Function registration
├── sk_render/                  # Regenerated by the adapter
│   ├── index.js
│   ├── entry.js
│   └── ...
├── host.json
└── package.json
```

A `func/package.json` for this sibling-directory layout is:

```json
{
	"private": true,
	"type": "module",
	"main": "*/index.js",
	"dependencies": {
		"@azure/functions": "^4.16.5"
	}
}
```

Use a valid `host.json`, such as the adapter's [template](src/server/template/host.json). Add other external runtime dependencies to this manifest and run `npm install --omit=dev --prefix func` before uploading `func` as `api_location`.

The `main` pattern must load the generated **`sk_render/index.js` wrapper**, including when instrumentation is enabled, and your custom Function registration modules. Reserve the `sk_render` directory, Function name and `/api/sk_render` route for the adapter. Other Functions use the v4 `app.http(...)` registration model; Azure does not support mixing v3 `function.json` registrations and v4 registrations in one Function app. See the [Azure v4 migration guide](https://learn.microsoft.com/en-us/azure/azure-functions/functions-node-upgrade-v4).

The working demo pairs [`func/package.json`](tests/demo/func/package.json) with [`HelloWorld/index.js`](tests/demo/func/HelloWorld/index.js), served at `/api/HelloWorld` alongside SvelteKit.

### Production platform context and authentication

On server-rendered requests, hooks, server loads and endpoints receive the Azure information through `event.platform`:

| Field                      | Source                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `platform.context`         | Azure `InvocationContext` for the request.                         |
| `platform.user`            | The Azure Functions SDK request user; nullable.                    |
| `platform.clientPrincipal` | Decoded `x-ms-client-principal`; `null` if missing or unparseable. |

The adapter also supplies SvelteKit's `getClientAddress()` from forwarded client-address information. Prerendered files are served as static output and have no per-request Azure identity.

Azure SWA handles sign-in and configured route access rules; application code remains responsible for authorization of its data and actions. The adapter exposes identity information without implementing a login/session service. Handle missing principals, and do not assume that a local authenticated mock proves production identity availability on every route. Azure documents that the API principal header does not contain the `claims` array, even though optional claims can be used in local emulation. See [Azure user information](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information#api-functions).

### Authorization header policy

**By default, the adapter strips inbound `Authorization` before constructing the SvelteKit request.** This applies to all seven supported methods: GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS. Hooks, loads and endpoints therefore see no Authorization header under the default policy.

Real SWA deployments have been observed to inject or overwrite this header, even when the caller sent none, through both fallback and explicit-rewrite routing. The SWA CLI does not reproduce that cloud behavior. Stripping prevents application code from mistaking an Azure-injected bearer token for an end-user credential. See [issue #218](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/218).

`preserveAuthorization: true` forwards the value received by the Function, unchanged. It cannot recover a caller's token after Azure has overwritten it. For application bearer authentication, use an application-specific header such as `x-app-authorization` and validate it in application code; treat `Authorization` as platform-owned on this managed surface. This policy does not remove `platform.clientPrincipal` or `platform.user`.

### Public-origin headers

The Function's inbound `host` can describe the internal Azure hop. The adapter builds the SvelteKit request URL from SWA's trusted `x-ms-original-url`, excludes that header from downstream request headers, and normalizes:

| Downstream header   | Value derived from `x-ms-original-url`               |
| ------------------- | ---------------------------------------------------- |
| `host`              | URL host, including a non-default port when present. |
| `x-forwarded-host`  | The same public host.                                |
| `x-forwarded-proto` | URL protocol without the colon, such as `https`.     |

These values overwrite inbound origin headers, including stale or client-supplied forwarded values. Normalization has no toggle and is independent of Authorization stripping.

The header-copy helper leaves origin headers unchanged when `x-ms-original-url` is absent or invalid. **The renderer still requires a valid original URL**: its request-construction path asserts that the header exists and constructs a `Request` from it. The helper's fallback does not provide a standalone direct-Functions deployment mode.

### Empty form POST handling

Azure can drop `content-type` on an empty native form POST, causing a Kit form action to return `415 Unsupported Media Type`. The adapter restores `application/x-www-form-urlencoded` when the request has no content type, `content-length: 0`, `sec-fetch-mode: navigate` and `sec-fetch-dest: document`. Other empty POSTs are not treated as form submissions by this heuristic.

This handling is automatic. `testWorkarounds: true` exposes diagnostic facts to help compare emulator and cloud behavior; it is not required to activate the fix.

## Local Development

### Vite versus SWA CLI

Use your normal `npm run dev` and `npm run preview` scripts for Kit development and preview. They use Kit's platform emulation; they do not execute the generated Azure Function wrapper or your sibling Functions.

To exercise built static output and Functions together, use the Azure Static Web Apps CLI. Install it as a development tool in your application and make [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) available as `func` on `PATH`. Use Node 22 for this local SWA/Core Tools flow; the application's broader package engine does not imply that these tools support every newer Node major.

```sh
npm install -D @azure/static-web-apps-cli
```

Create `swa-cli.config.json` for the default layout:

```json
{
	"configurations": {
		"app": {
			"appLocation": ".",
			"outputLocation": "./build/static",
			"apiLocation": "./build/server"
		}
	}
}
```

```sh
npm run build
npm install --omit=dev --prefix build/server
npx --no-install swa start app
```

Adjust the paths and dependency install for custom output. Local CLI success is useful deployment evidence, but it does not establish identical Azure header behavior. See the [demo setup](tests/demo/README.md) and [current CLI configuration](tests/demo/swa-cli.config.json), which use a custom API directory.

### Platform emulation

With no `emulate` option, Kit receives a platform object with null user/principal and a fresh invocation context. For an authenticated local identity, set `emulate: { role: 'authenticated' }` in your adapter options.

For a custom local identity, supply a principal:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				emulate: {
					clientPrincipal: {
						identityProvider: 'github',
						userId: 'alice',
						userDetails: 'alice@example.test',
						userRoles: ['authenticated', 'admin']
					}
				}
			})
		})
	]
});
```

Resolution rules:

- A supplied principal takes precedence over `role` and determines the mock user's identity and roles. Optional claims map into `platform.user.claimsPrincipalData`.
- `clientPrincipal: null` explicitly logs out, including with `role: 'authenticated'`.
- When the principal is omitted, `role: 'authenticated'` supplies the default `devUser`; otherwise both identity fields are null.

`emulate` also accepts a synchronous `() => EmulateState` provider, such as `emulate: () => state`. A local harness controlling that state in the Vite process can simulate login/logout without restarting the server. The exported `EmulateState` type describes the returned object.

The provider runs on each platform-emulation call, including Kit's build/prerender emulation. Results are not cached, supplied objects are not mutated, and invocation contexts are fresh. The provider receives no `Request`: shared state does not implement separate browser sessions, cookies, Azure route enforcement or cloud header rewriting. Deployed authentication comes from Azure.

## Instrumentation & Observability

### SvelteKit instrumentation

The adapter supports `src/instrumentation.server.ts` (or its JavaScript equivalent). When present, Kit's environment initializer runs before instrumentation, which runs before the application. The generated `sk_render/index.js` wrapper preserves this order. No experimental instrumentation flag is needed in Kit 3.

To collect Kit's server tracing spans, set `tracing: { server: true }` in `sveltekit({...})` and configure a collector/SDK in the instrumentation file. See [SvelteKit observability](https://svelte.dev/docs/kit/observability).

### Sentry 11 integration

Follow [Sentry's SvelteKit setup](https://docs.sentry.io/platforms/javascript/guides/sveltekit/) for SDK initialization and error hooks. The adapter-specific build setup below uses the default output layout and Sentry 11.8.0, the version tested by the demo. Install Sentry as an application runtime dependency:

```sh
npm install @sentry/sveltekit@^11.8.0
```

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

Place the Sentry plugin before Kit and use the `/vite` import with top-level plugin options. Sentry 11 uploads after the adapter has written its output. Keep `SENTRY_AUTH_TOKEN` in an ignored local environment file or CI secret; do not put it in public environment variables. Configure your own SDK DSN and matching release/environment as part of the official SDK setup.

The SDK is externalized from the server bundle so runtime initialization can precede application loading. With default API ownership, its version is copied from the application's `dependencies` into the generated manifest. With a custom `apiDir`, add it to the user-managed API manifest yourself. In either case, install Function production dependencies before deployment.

Adjust `sourcemaps.assets` for your output locations. The [complete demo Vite configuration](tests/demo/vite.config.ts) uses `build/static` and `func/sk_render`; its [server instrumentation](tests/demo/src/instrumentation.server.ts), [server hooks](tests/demo/src/hooks.server.ts) and [client hooks](tests/demo/src/hooks.client.ts) show the runtime integration.

### Source maps and repository paths

The adapter generates server sourcemaps while rebundling with Rolldown and retains input-map handling through `rolldown-plugin-sourcemaps`. For client maps, enable Vite `build.sourcemap`; SvelteKit performs native source-path rebasing when its output is copied. The adapter does not rebundle the client.

`sentryRewriteSourcesFactory(repositoryRoot)` returns a callback for Sentry's `sourcemaps.rewriteSources`. The root may be absolute or relative to the build's working directory. Each filesystem source is resolved using its own native `context.mapDir` and rewritten relative to the repository root; URL and null-prefixed virtual identifiers are preserved. Without context, sources pass through unchanged. The helper performs no directory scanning, caching or uploading.

For a repository-root `vite.config.ts`, use `import.meta.dirname` as above. For an app nested two directories below the repository root, use `sentryRewriteSourcesFactory(path.resolve(import.meta.dirname, '../..'))`, importing `path` from `node:path`. This is the demo's monorepo layout. Adapter 3 replaces the old output-directory-array and `prefixDir`/`log` helper arguments with this single repository-root argument.

Generated/copied maps remain output artifacts unless a later tool removes them. Client maps in the deployed static directory can be publicly accessible; configure Sentry's `sourcemaps.filesToDeleteAfterUpload` if you want to remove map files after uploading them. The adapter does not automatically upload or delete maps.

The release verification includes server map generation, copied client maps, representative local source-mapping regressions, successful Sentry upload and exact client/server event ingestion. A separate client symbolication experiment also succeeded. **Comprehensive production symbolication is not guaranteed:** automated original file/line/context assertions for both production event types and complete server-side symbolication through remote map lookup remain deferred. Upload or ingestion success alone does not prove those outcomes.

### Known issue: Sentry 11.8.0 and PostgreSQL

With Sentry 11.8.0 build-time instrumentation, the demo's `pg` import can produce unresolved CommonJS dependencies during the Azure Function build. The confirmed workaround belongs at the top level of the **Vite** configuration, alongside `plugins`:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	ssr: { external: ['pg'] },
	plugins: [sveltekit({ adapter: adapter() })]
});
```

When adding this to the Sentry example above, retain its Sentry plugin and other options. This is Vite `ssr.external`, distinct from the adapter's `external` option. It lets the tested demo build and run but may disable Sentry's automatic PostgreSQL instrumentation. This specific issue does not establish that CommonJS dependencies in general are incompatible. Track [Sentry issue #25470](https://github.com/getsentry/sentry-javascript/issues/25470) and the [tested configuration](tests/demo/vite.config.ts).

## Advanced, Troubleshooting & Migration

### Server bundling

`serverRolldown` is a synchronous `(options: RolldownOptions) => RolldownOptions` callback. It receives a **deep clone** of the adapter's configuration and must explicitly return a configuration object. You may modify the clone and return it, or return a replacement that preserves the required adapter values. Mutation without return, `undefined`, `null`, primitive values and arrays fail at build time.

For example, add a server-bundle plugin while retaining the supplied configuration:

```ts
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				serverRolldown(options) {
					options.plugins = [options.plugins, { name: 'custom-server-plugin' }];
					return options;
				}
			})
		})
	]
});
```

Preserve these supplied paths exactly:

- `input.entry` and `input.index`.
- `input['instrumentation-init']` and `input['instrumentation.server']` when instrumentation exists.
- `resolve.alias.SERVER_INSTANCE` and `resolve.alias.ENV`; a single-element array with the same path is also accepted.

Removing or changing these values fails the build with the affected field named. Additional entrypoints, aliases, plugins, externals and other non-conflicting options are supported. Retain the adapter's existing plugins and externals when extending those lists. Changes to `output` are ignored: the adapter restores its destination, ESM format, filenames and sourcemap configuration. Externals added here do not automatically become API manifest dependencies.

### Troubleshooting

| Symptom                                                                  | Check                                                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure cannot start the renderer or reports a missing module              | Install production dependencies in the deployed API root after building. For custom APIs, check ESM configuration, `main`, runtime dependencies and `host.json`. |
| Static files or the API are missing after upload                         | Point action inputs at the built directories, use an empty `output_location` with skipped builds, and update paths after changing directory options.             |
| Build fails for a Kit `/api` route, or it works locally but not in Azure | Move Kit endpoints outside Azure's reserved namespace. Suppressing the adapter check does not change Azure routing.                                              |
| A custom SWA rule breaks an endpoint or form action                      | Review first-match precedence and whether the rule needs `rewrite: '/api/sk_render'`.                                                                            |
| Bearer authentication behaves differently in Azure                       | Review the [Authorization header policy](#authorization-header-policy); preserving the header does not undo Azure overwrites.                                    |
| Empty native form actions return `415`                                   | Check the [empty-form heuristic](#empty-form-post-handling) and use diagnostic flags when comparing requests.                                                    |
| A customized server build fails                                          | Return a configuration explicitly and preserve the [required entrypoints and aliases](#server-bundling).                                                         |
| Sentry/`pg` bundling fails                                               | Apply the narrowly scoped [Vite SSR workaround](#known-issue-sentry-1180-and-postgresql).                                                                        |

#### Prerendered routes and SWA CLI trailing slashes

The local SWA static server can handle prerendered directories differently from Azure. In the demo, full refreshes produced redirect loops or `404`s until the root layout selected `trailingSlash: 'always'` for CLI builds. It uses a typed boolean `PUBLIC_SWA_CLI` declared in [`src/env.ts`](tests/demo/src/env.ts), read through `$app/env/public` in [`src/routes/+layout.ts`](tests/demo/src/routes/+layout.ts). Its `build:swa` script sets `PUBLIC_SWA_CLI=true`; production Azure builds keep it false.

Use that environment-specific policy when it suits your routes, and review lower-level trailing-slash overrides. Alternatively, disable prerendering for the affected routes only during CLI builds. This is local-emulator guidance, not a requirement to change production prerendering. Keep the detailed setup aligned with the [working demo](tests/demo/README.md).

#### Azure-managed builds and diagnostics

If Azure/Oryx build detection is slow or fails to resolve the environment, use the [prebuilt deployment workflow](#deploy-to-azure-static-web-apps). Keep the app build, API dependency installation and upload as explicit steps.

For request diagnostics, `debug` logs request/response information and `testWorkarounds` exposes compatibility facts. Leave these disabled unless needed. The repository's [demo](tests/demo/README.md) and [CI workflow](.github/workflows/ci-swa.yml) also contain backend V8 coverage examples; they are test infrastructure rather than deployment prerequisites.

### Migrating from adapter 2.x to 3.x

- Upgrade to SvelteKit `^3.1.0`, Node `>=22.17.0` and the Azure Functions peer `^4.16.5`. Deploy the managed API with `node:22`; adapter 3.x does not support Kit 2.
- Move configuration from `svelte.config.js`/`kit.adapter` to `sveltekit({ adapter: adapter(...) })` in `vite.config.ts`, following the [Kit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3).
- Use the scoped package name in imports and the `src/app.d.ts` reference.
- Use Sentry 11's `/vite` import and top-level build options. Replace the old Sentry source-path helper arguments with `sentryRewriteSourcesFactory(repositoryRoot)` and update upload globs to match the deployed output.
- Make every `serverRolldown` callback return its configuration explicitly and retain the adapter-owned entrypoints and aliases.
- Client rebundling has been removed. Enable client maps in Vite when needed; their copying and rebasing use Kit's native pipeline.
- Review output ownership, Function dependency installation and the production header policies above before deploying an upgraded application.

### Acknowledgements

- The [original adapter project](https://github.com/geoffrich/svelte-adapter-azure-swa) provided the upstream foundation.
- Thanks to [@sukeshpabolu](https://github.com/sukeshpabolu) for the Node 22 / Rolldown migration and the project's first external contribution.

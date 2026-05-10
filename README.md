[![NPM Version](https://img.shields.io/npm/v/%40ktarmyshov%2Fsvelte-adapter-azure-swa)](https://www.npmjs.com/package/@ktarmyshov/svelte-adapter-azure-swa)
[![CI](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=kt-npm-modules_svelte-adapter-azure-swa&metric=coverage)](https://sonarcloud.io/summary/new_code?id=kt-npm-modules_svelte-adapter-azure-swa)
[![License](https://img.shields.io/npm/l/@ktarmyshov/svelte-adapter-azure-swa)](./LICENSE)

# @ktarmyshov/svelte-adapter-azure-swa

`@ktarmyshov/svelte-adapter-azure-swa` is a SvelteKit adapter for deploying applications to Azure Static Web Apps.

It prepares the Azure Static Web Apps deployment layout from a SvelteKit build, including:

- Azure Functions output for the server build
- static content output
- generated `staticwebapp.config.json`
- SWA-oriented deployment safeguards and diagnostics

It also supports SvelteKit instrumentation, sourcemap-friendly output handling, local SWA platform emulation, and tested compatibility handling for real Azure Static Web Apps / Azure Functions quirks.

## Why this adapter

This adapter is focused on practical Azure Static Web Apps deployment rather than only producing nominally compatible output.

Key distinctions:

- prepares Azure Static Web Apps deployment output from a SvelteKit build
- generates Azure Functions output and static content output in the layout Azure SWA expects
- writes `staticwebapp.config.json` with SWA-safe defaults and routing safeguards
- supports the SvelteKit instrumentation contract
- uses a Rolldown-based output pipeline with sourcemap-friendly rebundling
- supports local SWA platform emulation for `App.Platform`-dependent code
- includes Azure-specific compatibility handling, diagnostics, and regression tests for real platform quirks

## Quick start

### Install

Install the adapter and the Azure Functions peer dependency:

```sh
npm install -D @ktarmyshov/svelte-adapter-azure-swa @azure/functions
```

### Configure SvelteKit

Use the adapter in `svelte.config.js`:

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
```

### TypeScript setup

If your project uses TypeScript, include the adapter types in `src/app.d.ts`:

```ts
/// <reference types="svelte-adapter-azure-swa" />
```

### Build

Run your normal SvelteKit production build:

```sh
npm run build
```

The adapter prepares the Azure Static Web Apps deployment artifacts as part of the build output.

## Recommended Azure SWA deployment flow

### Build first, then deploy

Recommended deployment flow:

1. install dependencies
2. run the app build yourself in CI
3. prepare the generated API output for deployment as needed
4. deploy the already-built output with the Azure Static Web Apps deploy action

Treat the Azure Static Web Apps GitHub Action as a deploy/upload step, not as the primary build system, unless you have a strong reason to do otherwise.

### Why this is recommended

Building the project yourself before deploy is recommended because it is typically:

- faster
- more predictable
- easier to control in CI
- less exposed to slow or flaky Oryx build detection
- less exposed to Azure/Oryx filesystem permission side effects

In practice, this also avoids cases where an Azure-managed build modifies directories in ways that interfere with later CI steps.

### Example GitHub Actions flow

The repository CI workflow at `./.github/workflows/ci-swa.yml` is the canonical example.

A typical flow is:

1. build the app yourself
2. if needed, install production dependencies into the generated or custom API directory
3. deploy prebuilt output with:
   - `skip_app_build: true`
   - `skip_api_build: true`

A minimal deployment step looks like this:

```yaml
- uses: Azure/static-web-apps-deploy@v1
  with:
    action: upload
    app_location: ./build/static
    api_location: ./build/server
    skip_app_build: true
    skip_api_build: true
```

If you use a custom `apiDir`, `api_location` should point to that directory instead.

### Path mapping

For the default output layout, the important Azure SWA action inputs are typically:

| input            | value            |
| ---------------- | ---------------- |
| `app_location`   | `./build/static` |
| `api_location`   | `./build/server` |
| `skip_app_build` | `true`           |
| `skip_api_build` | `true`           |

When deploying prebuilt output, `output_location` is typically not needed.

If your app lives in a subdirectory, adjust the paths accordingly.

## What the adapter generates

### Azure Static Web Apps deployment layout

The adapter prepares the Azure Static Web Apps deployment layout from the SvelteKit build output:

- Azure Functions output for the server build
- static content output for the frontend

With the default output layout, the generated files look like this:

```text
build/
├── server/
│   ├── sk_render/
│   │   ├── entry.js
│   │   ├── index.js
│   │   └── ...
│   ├── host.json
│   ├── local.settings.json
│   └── package.json
└── static/
    ├── _app/
    ├── staticwebapp.config.json
    └── ...
```

### Generated `staticwebapp.config.json`

The adapter generates `staticwebapp.config.json` with SWA-oriented defaults and routing behavior required for the deployment layout.

This includes safeguards around configuration areas that would otherwise break the generated SWA integration.

### Generated API package manifest

For the default generated API output path, the adapter also prepares a deployment-oriented `package.json`.

When you configure additional server externals, those dependencies are automatically carried into the generated API manifest for the default API output flow.

### Placeholder root index behavior

If the application root is not prerendered, the adapter writes the placeholder root index behavior needed by the generated SWA deployment layout.

## Configuration options

### `apiDir`

Controls where the generated Azure Functions output is written.

By default, the adapter writes the server output to `build/server` and also prepares the surrounding Azure Functions deployment files there.

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			apiDir: 'custom/api'
		})
	}
};
```

When you **do not** override `apiDir`, the adapter prepares the default Azure Functions deployment layout for you, including:

- `host.json`
- `local.settings.json`
- generated `package.json`
- automatic inclusion of configured externals in that generated `package.json`

When you **do** override `apiDir`, the adapter writes only the generated `sk_render` function into your custom API directory. It does this to avoid overwriting an API layout you manage yourself.

That means a custom `apiDir` shifts more deployment responsibility to you. In particular, your custom API directory must already be a valid Azure Functions location.

A custom `apiDir` output looks like this:

```text
custom/
└── api/
    └── sk_render/
        ├── entry.js
        ├── index.js
        └── ...
```

When using a custom `apiDir`, you are responsible for files such as `host.json` and `package.json` at the API root.

Your custom API `package.json` should use a `main` glob that includes both the generated `sk_render/index.js` entrypoint and any additional Azure Functions you deploy from that directory.

Example:

```json
{
	"main": "**/index.js",
	"dependencies": {
		"@azure/functions": "^4"
	}
}
```

Also note that the adapter reserves the folder prefix `sk_render` and the function route prefix `sk_render` for the generated function.

### `staticDir`

Controls where the generated static content output is written.

By default, the adapter writes static assets to `build/static`.

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			staticDir: 'custom/static'
		})
	}
};
```

Override this when you need a different deploy layout or want to integrate the static output into an existing structure.

### `customStaticWebAppConfig`

Allows extending the generated `staticwebapp.config.json`.

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			customStaticWebAppConfig: {
				routes: [
					{
						route: '/login',
						allowedRoles: ['admin']
					}
				],
				globalHeaders: {
					'X-Content-Type-Options': 'nosniff'
				},
				platform: {
					apiRuntime: 'node:22'
				}
			}
		})
	}
};
```

The adapter intentionally guards configuration areas that are critical to the generated SWA integration. Attempting to override the catch-all route or `navigationFallback` will throw.

Custom SWA configuration can still affect how requests are handled, so test any changes carefully.

### `allowReservedSwaRoutes`

Controls whether Azure SWA-reserved routes such as `/api` are allowed.

In production, Azure SWA routes `/api` and `/api/*` to the SWA API backend. SvelteKit routes beginning with `/api` can appear to work in development but return `404` in production because Azure never routes them to your SvelteKit app.

By default, the adapter throws at build time if it detects such routes.

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			allowReservedSwaRoutes: true
		})
	}
};
```

Setting this option only suppresses the build-time check. It does **not** make Azure route `/api` requests to SvelteKit.

### `external`

Marks selected server dependencies as external in the generated server bundle.

The adapter always includes these required externals:

- `fsevents`
- `@azure/functions`

You can add more externals like this:

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			external: ['@sentry/sveltekit']
		})
	}
};
```

For the default generated API output path, configured externals are automatically added to the generated API `package.json` when those dependencies exist in your app's `package.json`.

For custom API layouts, you are responsible for making sure the deployed API directory has the production dependencies it needs.

### `emulate`

Enables local Azure Static Web Apps platform emulation.

```js
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';

export default {
	kit: {
		adapter: adapter({
			emulate: {
				role: 'authenticated'
			}
		})
	}
};
```

This is useful when your application uses `App.Platform` and you want local development or tests to behave more like Azure SWA.

The emulation supports authenticated and anonymous flows and can provide a mock `clientPrincipal`, `user`, and Azure invocation context.

### `serverRolldown`

Advanced customization hook for the server-side Rolldown pipeline.

Use this only when you need to adjust the generated server bundling behavior directly.

### Diagnostics and test-oriented options

The adapter also exposes options such as:

- `debug`
- `testWorkarounds`

These are useful for diagnostics, platform-probe behavior, and test flows, but they are not part of the main deployment path.

## Instrumentation, sourcemaps, and observability

### Instrumentation support

The adapter supports the SvelteKit instrumentation contract.

If your app uses `src/instrumentation.server.*`, the instrumentation file is included in the generated Azure Functions output and wired into the server build flow.

This matters for observability and tooling that expects SvelteKit instrumentation support.

### Sourcemaps

The adapter uses a sourcemap-friendly output pipeline.

Specifically:

- the generated Azure Functions server output is rebundled with sourcemaps enabled
- the generated client output is also rebundled for correct sourcemap behavior
- standard repository layouts work out of the box

### Sentry in monorepos

Sentry source mapping in monorepos requires rewriting source paths relative to the repository root.

For that case, the package exports `sentryRewriteSourcesFactory`.

This rewrite is typically not needed outside monorepo layouts.

## Local development and diagnostics

### Regular development

Normal SvelteKit development remains normal. This adapter is primarily about production build output and Azure deployment layout.

### Azure SWA CLI

You can validate the generated output with the Azure Static Web Apps CLI.

A typical `swa-cli.config.json` looks like this:

```json
{
	"configurations": {
		"app": {
			"outputLocation": "./build/static",
			"apiLocation": "./build/server",
			"host": "127.0.0.1"
		}
	}
}
```

Run your build first, then start the CLI.

```sh
npm run build
swa start
```

If you use a custom `apiDir`, point `apiLocation` to that directory instead.

### Platform emulation

Platform emulation can be useful even without the SWA CLI when you want local behavior for `App.Platform`-dependent code.

It is especially helpful for:

- authenticated vs anonymous behavior
- application code that reads `platform.user`
- application code that reads `platform.clientPrincipal`
- local test scenarios that expect an Azure-like platform object

### Backend coverage example

The repository CI workflow at [`./.github/workflows/ci-swa.yml`](./.github/workflows/ci-swa.yml) demonstrates backend coverage collection for the SWA CLI / generated Azure Functions flow.

In that setup:

- coverage is collected in V8 form
- the generated reports are converted to lcov in CI

If this needs more explanation later, it can become a dedicated advanced guide.

### Azure-specific behavior notes

Local SWA CLI behavior is useful for validation, but it is not always identical to live Azure behavior.

This repository tracks some Azure-specific runtime quirks with diagnostics and regression tests so that changes in Azure behavior are easier to detect over time.

## Compatibility

This adapter targets:

- SvelteKit projects using `@sveltejs/kit`
- Azure Functions Node programming model v4
- Node 20 and Node 22

The package currently declares:

```json
{
	"engines": {
		"node": ">=20 <21 || >=22 <23"
	}
}
```

If you override the generated SWA config, keep the Azure runtime configuration aligned with the Node version you actually deploy.

## Migration / differences from upstream

This README documents this maintained fork/rework rather than the original adapter.

Compared with upstream, notable user-facing differences include:

- a Rolldown-based output pipeline
- improved sourcemap handling
- instrumentation support in the generated Azure Functions build flow
- local SWA platform emulation
- Azure-focused diagnostics and compatibility handling

The main README narrative is intentionally deployment-first rather than fork-history-first.

## Troubleshooting

### `/api` route conflicts

If your SvelteKit routes begin with `/api`, they can work locally but fail in production because Azure SWA reserves that route prefix for the API backend.

By default, the adapter throws at build time to protect you from this.

### Azure build path mistakes

Common deployment mistakes include:

- pointing `app_location` at the wrong directory
- pointing `api_location` at the wrong directory
- forgetting to update deploy paths after overriding `apiDir` or `staticDir`

### Oryx / Azure-managed build issues

If you let the Azure deploy action build the project for you, you may encounter:

- slow build detection
- environment-resolution failures
- filesystem permission side effects during CI

This is why the recommended deployment flow is to build first and upload prebuilt output.

### SWA CLI vs Azure cloud differences

Successful local SWA CLI validation does not guarantee identical behavior in the live Azure environment.

Treat the CLI as a valuable validation tool, not as a perfect simulation.

### Prerendered routes and `trailingSlash` in SWA CLI

When testing a SvelteKit app through the Azure Static Web Apps CLI, prerendered routes and full-refresh route handling may fail unless SWA-CLI-specific route option handling is applied.

In the demo app, removing the root-level `trailingSlash` policy caused two different failures during local SWA CLI testing:

- `/sverdle` on full refresh entered a redirect loop and failed with `ERR_TOO_MANY_REDIRECTS`
- `/sverdle/how-to-play` and `/sverdle/how-to-play/` returned `404`, even though `tests/demo/src/routes/sverdle/how-to-play/+page.ts` explicitly sets `export const prerender = true`

Two practical fixes are available.

#### Option 1: preferred when `trailingSlash` is not overridden below the root layout

If your app does not override `trailingSlash` in lower-level layouts or pages, the simplest fix is to define an SWA-CLI-aware root-level `trailingSlash` policy.

Use a shared SWA CLI environment helper:

```ts
// tests/demo/src/lib/swa-env.ts
import { PUBLIC_SWA_CLI } from '$env/static/public';

export const isSwaCli = PUBLIC_SWA_CLI === 'true';
```

Then derive the root-level trailing slash policy from it:

```ts
// tests/demo/src/routes/+layout.ts
import { isSwaCli } from '$lib/swa-env';

export const trailingSlash = isSwaCli ? 'always' : 'never';
```

In the demo app, restoring this root-level `trailingSlash` policy fixed the failing SWA CLI route handling.

Relevant demo files:

- `tests/demo/src/lib/swa-env.ts`
- `tests/demo/src/routes/+layout.ts`

#### Option 2: explicit per-route prerender control

If you prefer not to use the root-level `trailingSlash` fix, or if `trailingSlash` is already overridden in lower-level routes, disable prerender explicitly on prerendered routes for SWA CLI mode:

```ts
import { isSwaCli } from '$lib/swa-env';

export const prerender = !isSwaCli;
```

This is the more explicit route-level fix. It requires updating each prerendered route that should not be prerendered under SWA CLI.

For example, the demo app includes a prerendered leaf route here:

- `tests/demo/src/routes/sverdle/how-to-play/+page.ts`

A minimal SWA-CLI-aware version would look like this:

```ts
import { dev } from '$app/environment';
import { isSwaCli } from '$lib/swa-env';

// we don't need any JS on this page, though we'll load
// it in dev so that we get hot module replacement
export const csr = dev;

// prerender in normal environments, but disable it for SWA CLI local testing
export const prerender = !isSwaCli;
```

#### Which option to use

Use the root-level `trailingSlash` fix when all of the following are true:

- you are testing through SWA CLI
- you want the least invasive fix
- `trailingSlash` is not overridden in lower-level routes

Use route-level `prerender = !isSwaCli` when:

- you want explicit control over prerendered routes
- or `trailingSlash` is already customized below the root layout
- or you do not want SWA-CLI-specific trailing slash behavior to affect the whole app

If `trailingSlash` is overridden in lower-level routes or layouts, review those overrides carefully for SWA CLI testing, as behavior may become inconsistent.

### Monorepo Sentry path rewriting

If your app lives in a monorepo, Sentry source path rewriting relative to the repository root is required.

Use `sentryRewriteSourcesFactory` for that case.

### Empty form POSTs returning `415`

Azure SWA / Azure Functions can drop `content-type` on empty form submissions.

That can make SvelteKit return `415 Unsupported Media Type` for empty form POSTs.

This adapter includes an updated workaround for the currently observed Azure behavior, and the repository keeps diagnostics and regression tests around that path to help detect future platform changes.

## Acknowledgements

- credit to the [original adapter project](https://github.com/geoffrich/svelte-adapter-azure-swa) for the upstream foundation
- thanks to [@sukeshpabolu](https://github.com/sukeshpabolu) for the Node 22 / Rolldown migration and for being the first external contributor to the project

# @ktarmyshov/svelte-adapter-azure-swa

## Overview

`@ktarmyshov/svelte-adapter-azure-swa` is a SvelteKit adapter for deploying applications to Azure Static Web Apps.

It prepares the Azure Static Web Apps deployment layout from a SvelteKit build, including:

- Azure Functions output for the server build
- static content output
- generated `staticwebapp.config.json`
- SWA-oriented deployment behavior and safeguards

It also supports SvelteKit instrumentation, SWA-oriented sourcemap handling, local platform emulation, and tested compatibility handling for real Azure Static Web Apps / Azure Functions quirks.

## Why this adapter

This adapter is focused on practical Azure Static Web Apps deployment rather than only producing a nominally compatible output.

Key distinctions:

- prepares Azure Static Web Apps deployment output from a SvelteKit build
- generates Azure Functions output and static content output in the layout Azure SWA expects
- writes `staticwebapp.config.json` with SWA-safe defaults and routing safeguards
- supports SvelteKit instrumentation
- uses a Rolldown-based output pipeline with sourcemap-friendly rebundling
- includes Azure-specific compatibility handling, diagnostics, and regression tests for real platform quirks
- supports SWA-oriented local platform emulation

## Quick start

### Install

Install the adapter in your SvelteKit project:

```sh
npm install -D @ktarmyshov/svelte-adapter-azure-swa
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
/// <reference types="@ktarmyshov/svelte-adapter-azure-swa" />
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

1. build the app yourself in CI
2. prepare the generated API output for deployment as needed
3. deploy the already-built output with the Azure Static Web Apps deploy action

Treat the Azure Static Web Apps GitHub Action as a deploy/upload step, not as the primary build system, unless you have a strong reason to do otherwise.

### Why this is recommended

Building the project yourself before deploy is recommended because it is typically:

- faster
- more predictable
- easier to control in CI
- less exposed to Oryx build detection oddities
- less exposed to Azure/Oryx filesystem permission side effects

In practice, this also avoids cases where an Azure-managed build modifies directories in ways that interfere with later CI steps.

### Example GitHub Actions flow

A typical flow is:

1. install dependencies
2. run the app build yourself
3. ensure the generated API output has the production dependencies expected at deploy time
4. deploy prebuilt output with:
   - `skip_app_build: true`
   - `skip_api_build: true`

The repository CI workflow is the canonical example for this flow.

### Path mapping

For a prebuilt deployment flow, the important Azure SWA action inputs are typically:

- `app_location`: the generated static output directory
- `api_location`: the generated API / Azure Functions output directory
- `skip_app_build: true`
- `skip_api_build: true`

When deploying prebuilt output, `output_location` is typically not needed.

## What the adapter generates

### Azure Static Web Apps deployment layout

The adapter prepares the Azure Static Web Apps deployment layout from the SvelteKit build output:

- Azure Functions output for the server build
- static content output for the frontend

### Generated `staticwebapp.config.json`

The adapter generates `staticwebapp.config.json` with SWA-oriented defaults and routing behavior required for the deployment layout.

This includes guardrails around configuration areas that would otherwise break the generated SWA integration.

### Generated API package manifest

For the default generated API output path, the adapter also prepares a deployment-oriented package manifest.

When you configure additional server externals, those dependencies are automatically carried into the generated API manifest for the default API output flow.

### Placeholder root index behavior

If the application root is not prerendered, the adapter can write the placeholder root index behavior needed by the generated SWA deployment layout.

## Configuration options

### `apiDir`

Controls where the generated API / Azure Functions output is written.

Document:

- default behavior
- when to override it
- how custom API output changes deployment responsibilities

### `staticDir`

Controls where the generated static content output is written.

Document:

- default behavior
- when overriding it is useful
- how it affects deploy action path mapping

### `customStaticWebAppConfig`

Allows extending the generated `staticwebapp.config.json`.

Document:

- how the custom config is merged/applied
- which generated routing areas are intentionally guarded
- why overriding those guarded areas can break SWA integration

### `allowReservedSwaRoutes`

Controls whether Azure SWA-reserved routes such as `/api` are allowed.

Document:

- why `/api` is special in Azure SWA
- the default protective behavior
- when opting out is appropriate

### `external`

Marks selected server dependencies as external.

Document:

- what it changes in the server bundle
- how configured externals are automatically included in the generated API manifest for the default API output path
- how custom deployment layouts may shift more dependency/deploy responsibility to the user

### `emulate`

Enables local Azure Static Web Apps platform emulation.

Document:

- authenticated and anonymous emulation modes
- client principal / platform object behavior
- when this is useful for local development and testing

### `serverRolldown`

Advanced customization hook for the server-side Rolldown pipeline.

Document:

- what part of the build it affects
- what kinds of customization belong here
- that this is an advanced option

### Diagnostics and test-oriented options

Keep low-visibility notes for options such as:

- `debug`
- `testWorkarounds`

These are useful, but they should not dominate the main configuration path.

## Instrumentation, sourcemaps, and observability

### Instrumentation support

The adapter supports the SvelteKit instrumentation contract.

Document:

- instrumentation support is declared by the adapter
- server instrumentation files are included in the generated Azure Functions output
- this matters for observability and tooling that expects instrumentation support

### Sourcemaps

The adapter uses a sourcemap-friendly output pipeline.

Document:

- server output is rebundled with sourcemaps enabled
- client output is also rebundled for correct sourcemap behavior
- sourcemaps work correctly out of the box for standard repository layouts

### Sentry in monorepos

Sentry source mapping in monorepos requires rewriting source paths relative to the repository root.

Document:

- this requirement applies to monorepo layouts
- non-monorepo layouts typically do not need this rewrite
- `sentryRewriteSourcesFactory` exists specifically for this case

## Local development and diagnostics

### Regular development

Normal SvelteKit development remains normal.

Document briefly that this adapter does not change the standard local development flow more than necessary.

### Azure SWA CLI

Document how to validate the generated output with the Azure Static Web Apps CLI.

Include a short note that local SWA CLI behavior is useful but is not always identical to live Azure behavior.

### Platform emulation

Document the local platform emulation flow separately from the raw option reference.

This subsection should explain:

- what gets emulated
- authenticated vs anonymous behavior
- how this helps `App.Platform`-dependent application code and tests

### Backend coverage example

Keep this short in the main README.

Document only that:

- backend coverage through the SWA CLI / generated Azure Functions flow is supported in the project CI setup
- the repository workflow is the example reference
- coverage is collected in V8 form and converted to lcov in CI

If needed later, this can become a dedicated advanced guide.

### Azure-specific behavior notes

Keep a short note that some Azure Static Web Apps / Azure Functions runtime quirks differ from local tooling and are tracked with diagnostics and regression tests in this project.

## Compatibility

Document the compatibility envelope clearly:

- supported SvelteKit range
- Azure Functions Node programming model v4 alignment
- Node 20 / Node 22 expectations
- Azure SWA runtime expectations / defaults

## Migration / differences from upstream

This section should stay short and factual.

Document:

- that this README describes this maintained fork/rework
- the major output/build pipeline differences from upstream
- Rolldown-based rebundling
- instrumentation and sourcemap-related improvements
- SWA deployment and diagnostics improvements relevant to users migrating from upstream

Do not make fork history the main narrative of the README.

## Troubleshooting

### `/api` route conflicts

Explain:

- why `/api` is special in Azure Static Web Apps
- what the adapter protects against by default
- how to resolve or intentionally opt out

### Azure build path mistakes

Explain common deployment mistakes such as:

- wrong `app_location`
- wrong `api_location`
- mismatched custom output directories

### Oryx / Azure-managed build issues

Explain why prebuilt deploys are recommended and why Azure-managed builds can be less predictable.

### SWA CLI vs Azure cloud differences

Document clearly that successful local CLI validation does not guarantee identical behavior in the live Azure environment.

### Monorepo Sentry path rewriting

Explain that Sentry source path rewriting is required in monorepos and point users to the helper for that case.

### Empty form POSTs returning `415`

Document the Azure-specific empty form submission quirk:

- Azure SWA / Azure Functions can drop `content-type` on empty form submissions
- this can cause SvelteKit to return `415 Unsupported Media Type`
- the adapter includes an updated workaround for the current observed Azure behavior
- diagnostics and regression tests are used to keep track of future platform changes

## Acknowledgements

Keep this short.

Include:

- credit to the upstream adapter project
- any contributor or supporting credit you want to preserve

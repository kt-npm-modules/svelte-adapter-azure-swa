# @ktarmyshov/svelte-adapter-azure-swa

> Draft README structure for discussion. This is intentionally a first-pass document focused on positioning, section order, and key claims rather than final copy polish.

## Overview

`@ktarmyshov/svelte-adapter-azure-swa` adapts SvelteKit build output for deployment to Azure Static Web Apps.

It prepares the Azure Static Web Apps deployment layout, including:

- Azure Functions output for the SvelteKit server build
- static content output
- generated `staticwebapp.config.json`
- SWA-oriented deployment conveniences such as instrumentation support, sourcemap-friendly output handling, and platform emulation utilities

This adapter does not “do SSR” itself. SvelteKit does that. The adapter’s job is to shape the build output and deployment artifacts so that SvelteKit apps deploy cleanly to Azure Static Web Apps.

## Why this adapter

This adapter is designed around real Azure Static Web Apps deployment constraints rather than only the happy path.

Key distinctions:

- prepares Azure Static Web Apps deployment output directly from the SvelteKit build
- generates the Azure Static Web Apps deployment layout: Azure Functions output plus static content output
- writes `staticwebapp.config.json` with SWA-safe defaults and guarded behavior for critical routing rules
- supports the SvelteKit instrumentation contract
- uses a Rolldown-based rebundling pipeline with correct sourcemap handling
- includes Azure-specific compatibility handling, diagnostics, and regression tests for platform quirks
- supports SWA-oriented local platform emulation for `App.Platform` scenarios

## Quick start

### Install

Install the adapter in your SvelteKit project.

Example:

    npm install -D @ktarmyshov/svelte-adapter-azure-swa

If there are supported-version constraints worth surfacing here, add them as a short note rather than a long compatibility essay.

### Configure SvelteKit

Add the adapter in `svelte.config.js`.

Example:

    import azure from '@ktarmyshov/svelte-adapter-azure-swa';
    import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

    /** @type {import('@sveltejs/kit').Config} */
    const config = {
      preprocess: vitePreprocess(),
      kit: {
        adapter: azure()
      }
    };

    export default config;

Keep the first example minimal. Advanced options belong later.

### TypeScript setup

If the package requires a reference in `app.d.ts` or another TypeScript setup step, show the minimal supported example here.

This section should stay short and only include what a new user must do to get a working setup.

### Build

Build as usual:

    npm run build

The build produces the Azure Static Web Apps deployment artifacts prepared by the adapter.

## Recommended Azure SWA deployment flow

### Build first, then deploy

Recommended flow:

1. Build the app in your own CI.
2. Prepare the API output for deployment.
3. Use the Azure Static Web Apps deployment action only to upload and deploy the generated output.

The deployment action should be treated as a deploy step, not as the build system, unless you have a strong reason to do otherwise.

### Why this is recommended

This flow is recommended because it is:

- faster
- more predictable
- easier to debug
- less dependent on Oryx build detection behavior inside the Azure action
- less likely to hit Azure/Oryx filesystem permission weirdness during CI

In practice, building the app yourself and deploying prebuilt output avoids a class of flaky or opaque problems that are unrelated to the adapter itself.

### Example GitHub Actions flow

Point readers to the project’s `ci-swa.yml` as the authoritative example.

The README example here should stay compact and communicate the shape of the flow:

1. run the build yourself
2. install production dependencies in the API output if needed by the chosen deployment layout
3. deploy with `skip_app_build: true`
4. deploy with `skip_api_build: true`

A later revision can include a compact YAML example if wanted, but the main message matters more than copying a long workflow block into the README.

### Path mapping

Document the important Azure SWA deploy-action inputs clearly.

Typical mapping:

- `app_location`: static output directory
- `api_location`: Azure Functions output directory
- `skip_app_build: true`
- `skip_api_build: true`

If the deploy flow uses prebuilt output, explain that `output_location` is usually not needed in that path.

## What the adapter generates

### Azure Static Web Apps deployment layout

The adapter generates the Azure Static Web Apps deployment layout needed by the platform:

- Azure Functions output for the SvelteKit server build
- static content output for the deployed app

This section should explain the result of the build in deployment terms, not bundler terms.

### Generated `staticwebapp.config.json`

The adapter writes `staticwebapp.config.json` automatically.

This section should explain that the generated config includes SWA-safe defaults and the routing/fallback behavior needed for the generated deployment layout.

It should also make clear that some parts of the config are intentionally guarded because overriding them carelessly can break deployment behavior.

### Generated API package manifest

For the default API output path, the adapter generates the API package manifest needed for deployment.

This is also where the README should explain one of the important DX conveniences:

- configured externals are automatically carried into the generated API manifest for the default generated API output

That means users on the default path usually do not have to manually keep generated API deployment dependencies in sync.

## Configuration options

This section should be ordered from common to advanced.

### `apiDir`

Explain:

- what it changes
- the default
- when to override it
- that the default generated API path gives the adapter more room to automate deployment preparation

Also mention that custom API layouts are supported, but they may shift more deployment responsibility to the user.

### `staticDir`

Explain:

- what it changes
- the default
- when users may want a custom static output path

Keep this practical and Azure-oriented.

### `customStaticWebAppConfig`

Explain:

- how users can extend the generated `staticwebapp.config.json`
- which parts are intentionally guarded
- why those guardrails exist

The emphasis should be on safe extension rather than “total override.”

### `allowReservedSwaRoutes`

Explain:

- Azure SWA reserves `/api`
- the adapter protects users from accidental conflicts by default
- this option exists for users who understand the implications and want to opt out intentionally

### `external`

Explain:

- what stays external in the server bundle
- that for the default generated API output, configured externals are automatically added to the generated API package manifest
- that custom layouts may require more explicit deployment dependency handling

This section is both a reference note and a selling point.

### `emulate`

Explain:

- local SWA platform emulation support
- anonymous vs authenticated emulation use cases
- where it is useful for `App.Platform`-dependent apps

### `serverRolldown`

Explain:

- advanced server-bundling customization
- this is an advanced option and not required for the normal path

It should be clearly marked as advanced.

### Advanced notes

This subsection can briefly mention lower-level or niche options such as `debug` and `testWorkarounds` without letting them dominate the main options flow.

## Instrumentation, sourcemaps, and observability

### Instrumentation support

The adapter supports the SvelteKit instrumentation contract.

This section should explain that instrumentation output is preserved as part of the generated Azure Functions deployment output and that this matters for observability tooling which expects instrumentation support.

This is broader than Sentry and should be presented that way.

### Sourcemaps

Sourcemaps should be described as working correctly by default.

This section should briefly connect that outcome to the adapter’s Rolldown-based output handling without getting lost in implementation details.

The key message:

- correct sourcemap behavior is a first-class concern of the adapter

### Sentry in monorepos

This subsection should be explicit:

- in monorepos, Sentry source path rewriting relative to the repository root is required
- the package provides `sentryRewriteSourcesFactory` for that case
- in a non-monorepo layout, that rewrite step is generally not needed

This keeps the README precise:

- sourcemaps are correct by default
- monorepo Sentry upload/source mapping still needs path rewriting
- there is a helper for exactly that problem

## Local development and diagnostics

### Regular development

Explain that normal SvelteKit development stays normal.

This section should reassure users that they do not need to adopt a heavy Azure-specific workflow just to do day-to-day app development.

### Azure SWA CLI

Explain how the adapter output can be validated with the SWA CLI.

Also note clearly that SWA CLI behavior and Azure cloud behavior are not always identical, so local success should be treated as a strong signal but not as a perfect cloud guarantee.

### Backend coverage note

For v1, this can stay intentionally short.

Explain that backend coverage through the SWA CLI is supported by the project’s CI example and point readers to `ci-swa.yml`.

Also mention that the flow converts V8 coverage into LCOV afterward.

This is valuable, but detailed instructions can live in a separate guide later.

### Azure-specific behavior notes

Use this subsection to set expectations that Azure SWA / Functions sometimes behaves differently from local tooling and that the project tracks important quirks with diagnostics and regression tests.

This section should be brief and should lead into Troubleshooting rather than duplicating it.

## Compatibility

This section should be a compact compatibility reference.

Include the supported or targeted versions for:

- SvelteKit
- Azure Functions programming model expectations
- Node 20 / 22 support
- Azure SWA runtime expectations or defaults where relevant

The goal is to answer common “is this supported?” questions quickly.

## Performance

Keep this section short and factual.

Suggested themes:

- adapter overhead is low
- Rolldown keeps deployment preparation fast
- the adapter is not intended to be a build-time bottleneck

If an example number is included, it should be framed carefully as a demo-project signal, not a universal benchmark.

## Migration / differences from upstream

This section should preserve the upstream context without making the whole README about fork history.

Explain briefly:

- this README documents the maintained fork/rework
- what changed in broad terms
- Rolldown-based output pipeline
- instrumentation / sourcemap / Azure deployment improvements
- any user-visible option or behavior differences from upstream that matter during migration

Keep it short and practical.

## Troubleshooting

This section should contain concrete, operational problems users are likely to hit.

### `/api` route conflicts

Explain:

- why `/api` is special in Azure SWA
- what the adapter protects against by default
- when `allowReservedSwaRoutes` may matter

### Azure build path mistakes

Explain common mistakes around:

- wrong `app_location`
- wrong `api_location`
- mismatches caused by custom output directories

### Oryx / Azure-managed build issues

Explain why the “build first, then deploy” flow is recommended and how Azure-managed builds can introduce debugging, detection, or permissions problems.

### SWA CLI vs Azure cloud differences

Explain that the CLI is useful and important, but not a perfect model of cloud behavior.

### Monorepo Sentry path rewriting

Explain the symptom, the reason, and the fix:

- in monorepos, Sentry source path rewriting relative to the repository root is required
- use the helper provided by the package

### Empty form POSTs returning 415

This section should document the Azure platform quirk clearly:

- Azure SWA / Functions can drop `content-type` on empty form submissions
- this can make SvelteKit return `415 Unsupported Media Type`
- the adapter includes an updated workaround for current Azure behavior
- diagnostics and regression tests were added so future platform changes are easier to detect

This is a strong example of why the adapter emphasizes real Azure compatibility rather than only theoretical support.

## Acknowledgements

Use this final section for:

- upstream adapter credit
- contributor credit, if desired

Keep it short.

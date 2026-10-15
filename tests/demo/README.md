# SvelteKit 3 adapter demo

This is a fresh SvelteKit 3 application consuming the local adapter through `file:../..`.
Sentry 11, Paraglide, the Azure Functions output layout and SWA CLI are configured here.
The adapter-specific scenarios from `../demo-old` will be ported separately.

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

Unit tests include the scaffold's server, browser-component and Storybook projects.
Playwright checks both the raw SSR HTML and the hydrated page. The test scripts disable
Sentry runtime reporting and uploads so automated tests do not create project noise.
Browser installation is explicit, rather than repeated by every E2E invocation.

## Production build and local SWA

```sh
npm run build
npm run build:swa
npm run swa
# Or build and run the smoke test through SWA/Functions:
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

The deployment pipeline will be updated separately. Set `PLAYWRIGHT_TEST_BASE_URL` to
run E2E against an already running/deployed app instead of starting a local server.

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

Production upload, Sentry issue ingestion/readable frames and actual Azure deployment
must be verified separately; a successful local build does not establish those results.

# TODO

## Migrate to SvelteKit 3

Main tracker: [#329](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/329).
Plan checked against the repository on 2026-10-15 and the installed SvelteKit 3.1.0 Builder definitions/source in the new demo.

### Approach and scope

- Migrate and fix the existing adapter in the repository root in place.
- Build on the fresh SvelteKit 3 application in `tests/demo`. Set up the local adapter, Sentry and SWA infrastructure first; then selectively copy and adapt useful scenarios/tests from the old application. Do not run an automatic app migration or overwrite the new scaffold with old configuration.
- The old application is currently at `tests/demo-old` (the old-demo application discussed in chat). Treat it as a reference until replacement coverage passes.
- Target SvelteKit 3 only. Adapter 3.x is the new major release; adapter 2.x remains the Kit 2-compatible line. Do not introduce a Kit 2/3 compatibility layer.
- Keep root and demo as independent npm projects with their own lockfiles and VS Code windows. Keep the current root `@types/node` policy and leave the schema-download command unchanged.

### Current state

- [x] Remove root npm workspaces; keep a separate demo lockfile.
- [x] Simplify root ESLint/Prettier configuration and exclude demo projects from root checks.
- [x] Clean up unused root browser-test dependencies and make the push script stop on failure.
- [x] Create fresh `tests/demo` with Kit 3.1.0, Svelte 5, TypeScript 6, Vite 8 and the Vite-plugin configuration model.
- [ ] Finish the actual adapter migration: root dependencies, server-instance integration, Builder filesystem/configuration and instrumentation now target Kit 3; sourcemap cleanup and final integration verification remain.
- [ ] Connect the new demo to the local adapter. It currently uses `@sveltejs/adapter-auto` and has no Azure/Sentry integration or old adapter E2E suite.

### 1. Root dependencies and compatibility boundary

- [x] Set root `@sveltejs/kit` devDependency and peerDependency to `^3.1.0`, the current stable latest. Keep support restricted to Kit 3.
- [x] Update all root dependencies/devDependencies to registry latest versions, retaining caret ranges; constrain TypeScript to the latest stable 6.x (`^6.0.3`). Refresh the Azure Functions peer minimum to `^4.16.5`.
- [x] Raise the root Node engine to `>=22.17.0`, the Kit 3 minimum. ESLint's devDependency requirements do not define the published runtime minimum.
- [x] Refresh the root lockfile and verify ordinary `npm install` and clean `npm ci` without workspace hoisting or legacy peer-dependency flags (Node 24.21.0, npm 11.19.0).
- [x] Preserve the root NodeNext/checkJs setup and the existing `@types/node` policy.
- [ ] Apply the Node minimum to the new demo and check CI build/runtime versions when integrating the demo. Refresh its lockfile independently after integration dependencies are added.
- [ ] Verify the supported minimum Kit/Node combination with the migrated implementation. Dependency installation alone does not establish adapter compatibility.

Step 1 verification (2026-10-15): clean install, dependency-tree validation and root lint pass. Root type checking fails on the removed polyfills export, the old `Server` constructor/manifest API, missing instrumentation initializer and `builder.config.kit`; two secondary callback-type errors follow from the invalid server type. Unit tests: 19 pass in two suites; two header suites cannot load the removed polyfills export. These are the API migration tasks in steps 2–3, not a completed compatibility check. No adapter implementation or demo files were changed in step 1.

### 2. Migrate the adapter's server build and Azure entrypoint

Files: `src/server/index.js`, `src/server/entry/entry.js`, `src/server/entry/index.d.ts`, `src/server/entry/index.js`, `tests/unit/index.test.js`.

- [x] Replace `writeManifest()` / `builder.generateManifest()` with `builder.generateServerInstance(dest)`. Generate the instance module in the adapter's temporary directory and resolve it in the server Rolldown build.
- [x] Remove the custom `manifest.js`, `MANIFEST` alias/declaration and old alias to the generated server class. Import the generated `server` object instead of constructing `new Server(manifest)`.
- [x] Update the virtual module declaration to describe the Kit 3 `server` instance; Kit 3's `Server` is an interface, not a constructor.
- [x] Keep initialization once per cold start and await it before responding. Kit 3 accepts `Record<string, string | undefined>` for `env`, so revisit the old `process.env` cast/comment.
- [x] Remove `@sveltejs/kit/node/polyfills` / `installPolyfills()` from the runtime entrypoint and root header tests. Use native Node Web APIs; do not reintroduce replacement Undici classes.
- [x] Preserve the Azure integration: `app.setup({ enableHttpStream: true })`, registration of all supported methods, original URL reconstruction, streaming request body with `duplex: 'half'`, status/headers/body conversion and multiple cookies.
- [x] Preserve `platform.user`, `platform.clientPrincipal`, `platform.context` and `getClientAddress()` behavior. Audit `emulate()` / `emulatePlatform()` and their declarations against Kit 3.
- [x] Keep server Rolldown bundling, Node builtin handling, external dependencies, custom `apiDir`, generated Function package files and `serverRolldown` customization working. Existing externals/custom-directory/output-customization unit tests pass; a real uninstrumented Kit 3 server fixture also builds and responds.
- [x] Update the server-instance Builder mock and assertions. Verify actual Kit 3 generation, real Rolldown output and loading the generated Azure Function wrapper in a temporary app; complete the configuration/instrumentation mock changes in step 3.

Step 2 verification (2026-10-15): all 59 unit tests pass using native Node Web APIs. A temporary Kit 3.1.0 endpoint app was built with the real `bundleServer()` and Rolldown; the generated `sk_render/index.js` loaded, registered all seven methods and served three concurrent GET requests with the expected original URL, client address and platform context. Only Azure registration was stubbed. The fixture used Kit's own cookie dependency to avoid the older root transitive cookie package, and the check bypassed the full adapter configuration/instrumentation paths deliberately reserved for step 3. No demo files were changed. Root type checking now reports only the missing instrumentation initializer and `builder.config.kit` errors.

- [ ] After steps 3 and 5–7, verify the real demo build/deployment, server chunks/assets and the full Azure request/response scenarios. The temporary fixture is a server-build smoke check, not Azure deployment evidence.

### 3. Builder filesystem, configuration and instrumentation APIs

Files: `src/index.js`, `src/server/index.js`, `src/client/index.js`, `src/swa-config/index.js`, `src/index.d.ts`, `tests/unit/index.test.js`.

- [x] Replace `builder.rimraf()` and `builder.mkdirp()` with `node:fs` operations while preserving custom-directory cleanup behavior.
- [x] Replace `builder.config.kit.appDir` with the Kit 3 configuration shape. Review `builder.getAppPath()` where the base path matters; verify generated immutable-asset routes for default/custom `appDir` and `paths.base`.
- [x] Audit the remaining Builder calls and obsolete compatibility guards against the installed Kit 3 API. Update the unit-test mock rather than retaining legacy API fallbacks.
- [x] Generate the instrumentation environment initializer with `builder.createInstrumentationInitializer({ outputDirectory, ... })` when server instrumentation exists.
- [x] Bundle the initializer and its dependencies together with the server/instrumentation inputs. Pass the resulting output path as `initializer` to `builder.instrument()`.
- [x] Verify initializer -> instrumentation -> application execution order, environment availability and shared runtime module state. Avoid bundling separate copies of SvelteKit environment state across entrypoints.
- [x] Review the instrumentation facade's exports: the current Azure wrapper only performs `await import('./entry.js')` and has no default export; configure `module.exports` appropriately instead of assuming Kit's default facade export.
- [x] Verify cold start and request handling both with and without `instrumentation.server.ts`. Keep `supports.instrumentation` only when that execution order is proven.

Step 3 verification (2026-10-15): root `npm run check` passes. Regression tests build actual Kit 3.1.0 apps through the full adapter and use Node's native loader to import the generated Function wrapper with/without instrumentation and with custom API/static output directories. They assert runtime private environment availability in instrumentation, instrumentation-before-application execution, matching environment values in the request handler, three concurrent requests, preserved sibling custom Functions, cleaned stale static output and an immutable-asset route including `/base/assets`. Azure Function registration is stubbed; Kit, Rolldown, the generated initializer/facade and Request/Response handling are real. Root tests now contain 69 passing cases. No demo files or emulation options were changed. Actual Sentry/Azure deployment verification remains in later integration steps.

### 3a. Fix and extend platform-user emulation

Do this immediately after step 3, as a separate change before porting demo auth scenarios.

Files: `src/emulator/index.js`, `src/emulator/index.d.ts`, `src/index.d.ts`, root emulator tests and README.

- [ ] Fix the existing static `emulate.clientPrincipal` option: it is declared in the public types but ignored by the implementation, including on GitHub `main`. This predates the Kit 3 migration.
- [ ] Retain static options and allow a callback returning the complete emulation state (`role` and `clientPrincipal`) together. Resolve it on each platform-emulation call rather than once during adapter setup, allowing anonymous -> authenticated -> anonymous transitions without restarting the dev server.
- [ ] Define precedence and logout semantics: a supplied principal determines the user and its `userRoles`; `role: 'authenticated'` without a supplied principal creates the default test user. Define how an explicit `clientPrincipal: null` overrides any authenticated fallback.
- [ ] Keep `platform.user` and `platform.clientPrincipal` consistent, map optional claims correctly and create a fresh invocation context per call. Do not mutate caller-owned principal objects or cache callback results.
- [ ] Add tests for static custom principals with/without claims, the existing default authenticated/anonymous behavior, explicit logout and callback-driven anonymous -> authenticated -> anonymous transitions.
- [ ] Update public declarations and document examples and limitations. Kit's emulator callback receives route configuration/prerender state, not the Request; callback-driven shared test state does not provide cookie-based per-browser sessions.

### 4. Remove client rebundling; retain the server sourcemap workaround

Files: `src/client/index.js`, `tests/unit/index.test.js`, `tests/unit/utils.test.js`, `package.json`.

- [ ] Simplify the client path to `builder.writePrerendered(outDir)` and `builder.writeClient(outDir)`. Remove the second client Rolldown pass and its input globbing/options/imports.
- [ ] Verify relocated maps for default output and custom `staticDir`, including representative `.svelte` and `.ts` mappings back to original sources. Add a regression check against actual build output.
- [ ] Check copied assets, prerendered routes and Sentry client map resolution after removing rebundling.
- [ ] Remove dependencies only if no remaining code uses them: `tinyglobby` appears client-only; Rolldown remains necessary for the server.
- [ ] Keep `rolldown-plugin-sourcemaps` on the server. [#325](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/325) is a separate follow-up; [rolldown/rolldown#5561](https://github.com/rolldown/rolldown/issues/5561) was still open when checked. Remove the plugin only after a usable release provides input-map chaining and regression checks pass.

### 5. Prepare the fresh demo and install Sentry before copying scenarios

Files: `tests/demo/package.json`, `vite.config.ts`, `tsconfig.json`, `src/app.d.ts`, hooks and instrumentation files.

- [ ] When starting Sentry setup in the new `tests/demo`, execute the official setup prompt from the [Sentry SvelteKit guide](https://docs.sentry.io/platforms/javascript/guides/sveltekit/):

  > Use curl to download, read and follow https://skills.sentry.dev/instrument to set up the Sentry SvelteKit SDK.

  Apply it to the fresh demo with the local Azure SWA adapter and the migration requirements below.

- [ ] Add the local scoped adapter dependency (`@ktarmyshov/svelte-adapter-azure-swa`, `file:../..`) and Azure Functions/SWA CLI dependencies. Replace `adapter-auto` in `sveltekit({ adapter: ... })` and remove it if unused.
- [ ] Confirm adapter option typing from Vite and `App.Platform` types using the scoped package name. Do not copy the old unscoped `svelte-adapter-azure-swa` imports/type references unchanged.
- [ ] Install a Kit 3-compatible Sentry release, at least `@sentry/sveltekit` 11.4.0 as specified in #329. Verify the selected release's peers and refresh the demo lockfile.
- [ ] Configure `sentrySvelteKit` from `@sentry/sveltekit/vite` with current top-level options. Recreate build/upload configuration rather than copying `sourceMapsUploadOptions` or `unstable_sentryVitePluginOptions`.
- [ ] Set up server instrumentation, client initialization and error hooks using the new Sentry API; compose them with the fresh app's Paraglide hooks.
- [ ] Configure current Kit tracing options in `sveltekit({...})`. Do not restore `svelte.config.js` or the obsolete experimental instrumentation switch.
- [ ] Enable and verify production sourcemaps and upload paths for the chosen static/API output directories. Test plugin ordering and upload timing after adapter output exists.
- [ ] Verify the fresh demo's check/lint/unit/browser-test setup independently. Keep its Kit 3 `$app/tsconfig`, `$app/types` and `#lib` conventions; review Storybook/enhanced-img integration without making those features migration requirements.
- [ ] Add SWA build/start scripts, runtime selection and test-mode environment configuration. Define one consistent output layout (`build/static` and `func` if preserving the existing CI contract).

### 6. Simplify or remove the public Sentry helper

Files: `src/utils.js`, `src/index.js`, `src/index.d.ts`, `tests/unit/utils.test.js`, demo Vite config and README.

- [ ] Use native `rewriteSources(source, map, context)` / `context.mapDir` instead of recursively scanning output directories, parsing maps and caching source-to-directory associations.
- [ ] First try expressing the required source paths directly in the new demo's Sentry configuration. If the public helper is no longer useful, remove its implementation, export, declarations and tests as part of the major release.
- [ ] If retained, redesign the helper signature/types around the native context and remove scanning/cache arguments and behavior. Verify paths from the independent demo still resolve to repository application sources.
- [ ] Verify both client and server errors in Sentry against original source files/lines; accepting uploads alone is insufficient. Update documentation and changeset for any removed public helper.

### 7. Selectively port old-demo integration coverage

Source: `tests/demo-old`. Destination: `tests/demo`. Start this after the new app has the local adapter, Sentry and SWA configuration above.

| Old reference                                                      | What to bring into the new app                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte.config.js`, `swa-cli.config.json`, `func/`                 | Recreate adapter options in Vite, API runtime override, custom directories, explicit diagnostic rewrite and the custom `HelloWorld` Azure Function. Preserve required Function host/package files. |
| `src/lib/swa-env.ts`, route prerender options                      | Adapt test-mode/environment handling and mixed SSR/prerender behavior. Verify homepage, about and Sverdle static/deep routes, including trailing slashes.                                          |
| `src/routes/methods/`, `empty-post-form/`                          | Endpoints for all supported methods, JSON/form request bodies, empty POST and native form-action edge cases.                                                                                       |
| `src/routes/pg-smoke/`                                             | Node/CommonJS dependency interoperability smoke test and its `pg` dependency.                                                                                                                      |
| `src/lib/diagnose.ts`, `diagnose.spec.ts`, both diagnostic routes  | Sanitized diagnostics for auth/forwarded headers and separate navigation-fallback versus explicit-rewrite paths.                                                                                   |
| Sentry example routes, hooks and instrumentation                   | Adapt error scenarios to the already configured Sentry 11 integration; retain browser and server error coverage.                                                                                   |
| `e2e/demo.test.ts`, `diagnostic-headers.test.ts`, `sentry.test.ts` | Port assertions/scenarios after their routes exist; adapt expected Kit 3 behavior instead of copying obsolete workarounds.                                                                         |
| `playwright.config.ts`, E2E fixtures/teardown                      | Rebuild preview, local SWA and deployed-Azure modes, reports and coverage around the new app. Review old Istanbul fixtures against the current V8/CDP coverage flow.                               |

- [ ] Adapt copied imports (`$lib`, `$env/*`, `$app/environment`, old hook type locations) to current Kit 3 conventions and generated route types. Use the fresh app as the configuration reference.
- [ ] Preserve the current Authorization/forwarded-origin policies and their root unit tests. Kit migration is not a reason to change the security behavior already established by the project specs.
- [ ] Retain the 16 sanitized auth probes across the two routing channels and all seven supported methods. Never expose raw credentials in diagnostic responses or artifacts.
- [ ] In Playwright, add explicit `testDir`/matching for the ported `e2e/*.test.ts` files. The fresh scaffold currently discovers `*.e2e.{ts,js}` and otherwise would miss them.
- [ ] Keep or deliberately adapt the scaffold's existing browser tests. Separate basic UI smoke checks from SWA-only custom-Function/platform assertions.
- [ ] Do not remove `tests/demo-old` until the replacement coverage is complete; then remove/archive it and clean obsolete paths and ignore patterns.

### 8. Independent installs, CI, coverage and release flow

Files: root/demo `package.json`, `.github/workflows/ci.yml`, `.github/workflows/ci-swa.yml`, `.github/dependabot.yml`, `.githooks/pre-push`, `tests/coverage/mcr-report-swa.mjs`.

- [ ] Make CI install root and demo dependencies explicitly before demo build/check/test commands. Audit the shared `kt-workflows/actions` defaults; root `npm ci` alone no longer installs the demo.
- [ ] Include both lockfiles in the relevant dependency caches. Resolve Playwright/browser tools from the demo installation and provision Azure Functions Core Tools for local SWA runs.
- [ ] Align `*:all` commands, pre-push checks and release/version commands with independent dependency ownership. The demo currently has no `coverage` script although root `coverage:all` calls one: define the intended command or remove the stale aggregate.
- [ ] Fix coverage-tool ownership: `tests/coverage/mcr-report-swa.mjs` imports `monocart-coverage-reports` from a root-relative script, but the root does not declare it. Either declare it where the script lives or move/run the report in the project that owns the dependency.
- [ ] Reconcile V8 output paths, CDP teardown and `NODE_V8_COVERAGE` propagation; verify both build-phase and Function request coverage are collected and mapped to the right sources.
- [ ] Preserve local SWA and real Azure jobs, correct deployment static/API locations, Function production dependency installation, `PLAYWRIGHT_TEST_BASE_URL` handling and existing report/coverage artifacts.
- [ ] Keep Azure runtime selection separate from the build machine's Node version. Verify the deployed runtime meets Kit 3's minimum rather than assuming local Node 24 implies Azure Node 24 support.
- [ ] Add the independent demo to Dependabot configuration; currently only `/` is configured. Decide deliberately how the retired demo is treated.
- [ ] Exercise `npm pack` and install the resulting package in the demo or a temporary consumer, in addition to the local file dependency. Verify packaged imports/types/Function templates and absence of repository-only files.

### 9. Documentation and major release

- [ ] Rewrite README setup/config examples for Kit 3 and `sveltekit({...})` in Vite. State the adapter 2.x/Kit 2 versus adapter 3.x/Kit 3 boundary and Node minimum.
- [ ] Review every adapter option, default and example against the migrated implementation, including external dependencies, custom API/static paths, SWA routes, auth/client principal and instrumentation.
- [ ] Replace old Sentry upload/helper guidance with the tested Sentry 11 setup. Update demo instructions for separate installs and VS Code windows.
- [ ] Verify documented commands and snippets against the finished app. Update affected project specs/development notes and old demo paths.
- [ ] Add a major changeset for adapter 3.0.0 with the dependency/API breaking changes. Preserve published `src`, `README`, `LICENSE`, `CHANGELOG.md`, package exports and `main`/`types` metadata.

### Completion gates

- [ ] Root formatting/lint, TypeScript checks, unit tests and coverage pass against Kit 3.
- [ ] Independent demo install, Svelte checks, lint, unit/browser tests and production build pass with the local/packed adapter.
- [ ] Default and custom output layouts work; source-map regression checks resolve original application files.
- [ ] Preview and local SWA E2E pass with the intended environment-specific assertions.
- [ ] Real Azure preview deployment and E2E pass: SSR/prerender/deep routes, reserved `/api`, custom Function, HTTP methods/bodies, cookies, auth/principal/forwarded headers and dependency interoperability.
- [ ] Instrumentation/environment order and client/server Sentry source locations are verified end to end. Local SWA emulation alone is not evidence of Azure header behavior.
- [ ] Clean CI/release installs and npm tarball validation pass; README instructions match the final setup.

### References and separate follow-ups

- [#329: migration scope and compatibility policy](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/329).
- [Official Kit 3 migration reference](https://svelte.dev/docs/kit/migrating-to-sveltekit-3) and [adapter API](https://svelte.dev/docs/kit/@sveltejs-kit#Builder). Use as an API checklist, not an instruction to auto-migrate the new app.
- [Upstream issue #213](https://github.com/geoffrich/svelte-adapter-azure-swa/issues/213) and [PR #214](https://github.com/geoffrich/svelte-adapter-azure-swa/pull/214): useful server-instance/config implementation reference; do not copy its dual Kit 2/3 compatibility approach.
- [#208](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/208) and [#317](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/317) are superseded by #329; their Sentry-helper and client-sourcemap cleanup belongs in this plan.
- [Sentry migration reference](https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md), [native rewriteSources context](https://github.com/getsentry/sentry-javascript/pull/20142) and [Kit sourcemap rebasing](https://github.com/sveltejs/kit/pull/17082).
- [#84: Superforms 3 coverage](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/84), [#197: remote functions](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/197) and [#325: Rolldown input sourcemaps](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/325) remain separate follow-ups and do not block this migration. The latest #84 clarification explicitly keeps Superforms outside #329 despite an older contradictory comment.

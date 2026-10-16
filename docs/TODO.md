# TODO

## Migrate to SvelteKit 3

Main tracker: [#329](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/329).
Plan checked against the repository on 2026-10-16 and the installed SvelteKit 3.1.0 Builder definitions/source in the new demo.

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
- [x] Connect the new demo to the local scoped adapter, Azure/SWA and Sentry 11. Adapter E2E scenarios now run from the new demo (step 7); live Sentry and deployed-Azure verification remain pending below.

### 1. Root dependencies and compatibility boundary

- [x] Set root `@sveltejs/kit` devDependency and peerDependency to `^3.1.0`, the current stable latest. Keep support restricted to Kit 3.
- [x] Update all root dependencies/devDependencies to registry latest versions, retaining caret ranges; constrain TypeScript to the latest stable 6.x (`^6.0.3`). Refresh the Azure Functions peer minimum to `^4.16.5`.
- [x] Raise the root Node engine to `>=22.17.0`, the Kit 3 minimum. ESLint's devDependency requirements do not define the published runtime minimum.
- [x] Refresh the root lockfile and verify ordinary `npm install` and clean `npm ci` without workspace hoisting or legacy peer-dependency flags (Node 24.21.0, npm 11.19.0).
- [x] Preserve the root NodeNext/checkJs setup and the existing `@types/node` policy.
- [x] Apply Node >=22.17 to the new demo, refresh its independent lockfile and verify clean installation. Add `.nvmrc` for Node 22 because the current SWA CLI/Core Tools rejects Node 24.
- [ ] Finish CI/build/deployed-runtime verification in step 8; local SWA was tested on Node 22.23.3, not the exact supported minimum.
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
- [ ] Define and verify the `serverRolldown` contract around adapter-owned inputs. Required server-instance and instrumentation inputs must not be removable accidentally by a custom callback without a clear build-time failure; either validate the returned configuration or document and enforce the required invariants. Add a regression test covering instrumentation with a customized `serverRolldown` result.

Step 3 verification (2026-10-15): root `npm run check` passes. Regression tests build actual Kit 3.1.0 apps through the full adapter and use Node's native loader to import the generated Function wrapper with/without instrumentation and with custom API/static output directories. They assert runtime private environment availability in instrumentation, instrumentation-before-application execution, matching environment values in the request handler, three concurrent requests, preserved sibling custom Functions, cleaned stale static output and an immutable-asset route including `/base/assets`. Azure Function registration is stubbed; Kit, Rolldown, the generated initializer/facade and Request/Response handling are real. Root tests now contain 69 passing cases. No demo files or emulation options were changed. Actual Sentry/Azure deployment verification remains in later integration steps.

### 3a. Fix and extend platform-user emulation

Implemented after step 3 as a separate change, before porting demo auth scenarios.

Files: `src/emulator/index.js`, `src/emulator/index.d.ts`, `src/index.d.ts`, root emulator tests and README.

- [x] Fix the existing static `emulate.clientPrincipal` option: it is declared in the public types but ignored by the implementation, including on GitHub `main`. This predates the Kit 3 migration.
- [x] Retain static options and allow a callback returning the complete emulation state (`role` and `clientPrincipal`) together. Resolve it on each platform-emulation call rather than once during adapter setup, allowing anonymous -> authenticated -> anonymous transitions without restarting the dev server.
- [x] Define precedence and logout semantics: a supplied principal determines the user and its `userRoles`; `role: 'authenticated'` without a supplied principal creates the default test user. An explicit `clientPrincipal: null` logs out even when the fallback role is authenticated.
- [x] Keep `platform.user` and `platform.clientPrincipal` consistent, map optional claims correctly and create a fresh invocation context per call. Do not mutate caller-owned principal objects or cache callback results.
- [x] Add tests for static custom principals with/without claims, the existing default authenticated/anonymous behavior, explicit logout and callback-driven anonymous -> authenticated -> anonymous transitions.
- [x] Update public declarations and document examples and limitations. Kit's emulator callback receives route configuration/prerender state, not the Request; callback-driven shared test state does not provide cookie-based per-browser sessions.

Step 3a verification (2026-10-15): the exported `EmulateState` describes static state; `EmulateOptions` also accepts a synchronous state provider. The provider runs inside each platform-emulation call and is not invoked/cached during adapter setup. Tests cover static principals with/without claims, precedence over both fallback roles, explicit null logout, default users, callback-driven login/logout, immutable caller objects and distinct invocation IDs. All 80 tests pass, including the full Kit 3 build regressions. README examples and state-resolution/session limitations are documented; demo files are unchanged.

### 4. Remove client rebundling; retain the server sourcemap workaround

Files: `src/client/index.js`, `tests/unit/index.test.js`, `tests/unit/fixtures/kit3-build.mjs`, `package.json`, `package-lock.json`, README.

- [x] Simplify the client path to `builder.writePrerendered(outDir)` and `builder.writeClient(outDir)`. Remove the second client Rolldown pass and its input globbing/options/imports.
- [x] Verify relocated maps for default output and custom `staticDir`, including representative `.svelte` and `.ts` mappings back to original sources. Add a regression check against actual build output.
- [x] Check copied static assets and prerendered routes after removing rebundling.
- [ ] Verify Sentry resolves the copied client maps end to end. Sentry is configured and upload succeeded in step 5; original error locations remain part of the integration gates, not evidence from upload success or local source-map checks.
- [x] Remove dependencies only if no remaining code uses them: `tinyglobby` was client-only and is removed from direct dependencies (it remains a transitive dev dependency of the toolchain). Rolldown remains necessary for the server.
- [x] Keep `rolldown-plugin-sourcemaps` on the server. [#325](https://github.com/kt-npm-modules/svelte-adapter-azure-swa/issues/325) is a separate follow-up; [rolldown/rolldown#5561](https://github.com/rolldown/rolldown/issues/5561) was still open when checked. Remove the plugin only after a usable release provides input-map chaining and regression checks pass.

Step 4 verification (2026-10-15): all 80 tests pass. Real Kit 3 builds now include a prerendered Svelte page importing TypeScript, production client sourcemaps and a static asset. For both default and custom output directories, regression checks assert copied JavaScript is byte-for-byte unchanged, sourcemap mappings/names/sourcesContent are preserved, relocated source paths resolve to the same files, and representative generated positions map back to the expected original `.svelte`/`.ts` source lines. The fixture now writes an actual Vite config because Kit's prerender worker reloads it. A unit assertion ensures only the server invokes Rolldown. Server bundling and `rolldown-plugin-sourcemaps` remain unchanged; demo files are unchanged.

### 5. Prepare the fresh demo and install Sentry before copying scenarios

Files: `tests/demo/package.json`, `vite.config.ts`, `tsconfig.json`, `src/app.d.ts`, hooks and instrumentation files.

- [x] When starting Sentry setup in the new `tests/demo`, execute the official setup prompt from the [Sentry SvelteKit guide](https://docs.sentry.io/platforms/javascript/guides/sveltekit/):

  > Use curl to download, read and follow https://skills.sentry.dev/instrument to set up the Sentry SvelteKit SDK.

  Apply it to the fresh demo with the local Azure SWA adapter and the migration requirements below.

- [x] Add the local scoped adapter dependency (`@ktarmyshov/svelte-adapter-azure-swa`, `file:../..`) and Azure Functions/SWA CLI dependencies. Replace `adapter-auto` in `sveltekit({ adapter: ... })` and remove it if unused.
- [x] Confirm adapter option typing from Vite and `App.Platform` types using the scoped package name. Do not copy the old unscoped `svelte-adapter-azure-swa` imports/type references unchanged.
- [x] Install a Kit 3-compatible Sentry release, at least `@sentry/sveltekit` 11.4.0 as specified in #329. Verify the selected release's peers and refresh the demo lockfile.
- [x] Configure `sentrySvelteKit` from `@sentry/sveltekit/vite` with current top-level options. Recreate build/upload configuration rather than copying `sourceMapsUploadOptions` or `unstable_sentryVitePluginOptions`.
- [x] Set up server instrumentation, client initialization and error hooks using the new Sentry API; compose them with the fresh app's Paraglide hooks.
- [x] Configure current Kit tracing options in `sveltekit({...})`. Do not restore `svelte.config.js` or the obsolete experimental instrumentation switch.
- [x] Enable production sourcemaps and configure upload paths for `build/static` and `func/sk_render`. Put Sentry before Kit; inspect Sentry 11.8's post-`buildApp` upload hook to confirm it runs after adapter output.
- [x] Perform actual upload with the build token. The user ran the demo build and reported `[sentry-vite-plugin] Info: Successfully uploaded source maps to Sentry`; the token works for uploads.
- [ ] Verify client/server error ingestion and original source locations. Upload success alone does not establish readable stack traces. The available token returns HTTP 403 on project-read APIs; Sentry MCP is unavailable. Verify in the Sentry UI or with suitable read access after adding error scenarios.
- [x] Verify the fresh demo's check/lint/unit/browser-test setup independently. Keep its Kit 3 `$app/tsconfig`, `$app/types` and `#lib` conventions; review Storybook/enhanced-img integration without making those features migration requirements.
- [x] Add SWA build/start scripts, runtime selection and test-mode environment configuration. Define one consistent output layout (`build/static` and `func` if preserving the existing CI contract).

Step 5 local verification (2026-10-15): Sentry 11.8.0 supports Kit 3 and is installed as an external server dependency. The official `https://skills.sentry.dev/instrument` skill and its SvelteKit/manual/source-map references were downloaded with curl and read. Existing project/DSN settings are reused; no new project was provisioned. Vite loads the build token from ignored `tests/demo/.env.local`, and tests explicitly disable SDK reporting and uploads. A scan of generated JS/maps/HTML confirms the token is absent. Clean independent `npm ci`, demo Svelte-check and lint pass; 10 unit/browser/Storybook tests and production-preview E2E pass. Local SWA/Functions E2E also passes on Node 22.23.3, checking exact SSR HTML and hydrated heading. Root implementation is unchanged. `tests/demo-old` scenarios, Sentry example routes and diagnostic routes have not been copied; they belong to step 7. Actual Azure deployment remains in step 8. The user subsequently confirmed a successful sourcemap upload from their demo build. The skill's live-ingestion/readable-stack completion gate remains open; the matching verification is also tracked in steps 6–7.

### 6. Simplify or remove the public Sentry helper

Files: `src/utils.js`, `src/index.js`, `src/index.d.ts`, `tests/unit/utils.test.js`, demo Vite config and README.

- [x] Use native `rewriteSources(source, map, context)` / `context.mapDir` instead of recursively scanning output directories, parsing maps and caching source-to-directory associations.
- [x] Retain a small public `sentryRewriteSourcesFactory(repositoryRoot)` helper so consumers only supply their repository root. Use it in the demo configuration; remove the old directory-array/options contract, scanning/cache implementation and helper-only fixtures.
- [x] Resolve each filesystem source against its own map directory and the repository root; preserve URL/virtual identifiers. The helper uses the native context. Verify paths from the independent demo still resolve to repository application sources.
- [x] Update the Sentry-specific README guidance and demo documentation; add a major changeset for the new `sentryRewriteSourcesFactory` signature. The full README review remains in step 10.
- [ ] Verify both client and server errors in Sentry against original source files/lines with the native callback; accepting uploads alone is insufficient. Complete alongside the error scenarios in step 7.

Step 6 local verification (2026-10-16): the helper is retained with a repository-root argument and native `context.mapDir`, replacing the old output-directory array and `prefixDir`/`log` options. Root check/lint and all 86 tests pass; demo check and production build pass with reporting/upload disabled. Regression tests cover client/server paths, identical source strings in distinct map directories, URL/virtual identifiers, missing context and cwd-relative roots. The helper also passes offline Sentry upload preparation on 50 real maps and two synthetic maps: 39 application sources resolve correctly, with mappings/content preserved and on-disk maps unchanged. Live client/server error verification remains in step 7; no new upload is performed by the local checks.

### 7. Selectively port old-demo integration coverage

Source: `tests/demo-old`. Destination: `tests/demo`. Custom Kit routes now live under `src/routes/adapter`; custom shared diagnostic code lives under `src/lib/adapter/server`. Home, About, Sverdle and add-on examples remain scaffold pages.

| Old reference                                     | New location / status                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `svelte.config.js`, SWA config, `func/`           | Current Vite options retained; added explicit `/adapter/diagnostic-headers-rewrite` rewrite, `testWorkarounds` and `func/HelloWorld`. Function manifest loads both `HelloWorld` and generated `sk_render`.  |
| `swa-env.ts`, route options                       | Use the existing typed Kit 3 `PUBLIC_SWA_CLI` env directly; root layout selects SWA trailing slashes, adapter layout keeps stable paths. Scaffold prerender settings retained.                              |
| Old About server/platform code                    | `/adapter/platform` shows selected user/principal/context facts and exercises `getClientAddress`; old raw-claims logging/display was not copied.                                                            |
| `methods/`, `empty-post-form/`                    | `/adapter/methods` echoes method/body for all supported methods; `/adapter/empty-post-form` uses runes and typed action data with workaround facts.                                                         |
| `pg-smoke/`                                       | `/adapter/pg-smoke`, independent demo `pg` dependency and `@types/pg`.                                                                                                                                      |
| `diagnose.ts`, unit tests, both diagnostic routes | Shared sanitized helper/tests under `src/lib/adapter/server`; two `/adapter/diagnostic-headers-*` routes preserve the original contract.                                                                    |
| Sentry example                                    | Fresh `/adapter/sentry` page and `/adapter/sentry/error` endpoint use the already configured SDK. Separate real client/server errors; buttons wait for hydration, and status text does not claim ingestion. |
| Old E2E suite                                     | Ported assertions under `e2e/`, including all 16 diagnostic probes. Existing scaffold E2E/browser/Storybook tests retained.                                                                                 |
| Istanbul fixtures/teardown                        | Reviewed, not copied: legacy `window.__coverage__` collection does not match the new V8 setup. Coverage ownership/collection remains in step 8.                                                             |

- [x] Add `/adapter` scenario index and navigation from the scaffold. Keep the custom Azure Function at `/api/HelloWorld` outside Kit routes.
- [x] Adapt imports, runes, hook/type conventions and generated route types to Kit 3. Keep the fresh app as configuration reference.
- [x] Preserve the current Authorization/forwarded-origin policies and root unit tests. No adapter runtime policy was changed.
- [x] Retain all 16 sanitized auth/header probes across two routing channels and all seven supported methods. No raw credentials are attached to reports.
- [x] Configure explicit Playwright discovery for `e2e/*.test.ts` and existing colocated `*.e2e.ts`. Freeze preview/SWA/Azure target selection before workers start; CI alone does not imply Azure.
- [x] Keep scaffold browser tests and verify direct SSR/static/deep routes, navigation, Sverdle form/cookie persistence, platform facts, HTTP/body handling, native empty forms, `pg` imports and the custom Function. Separate preview assertions from SWA/Azure-only cases.
- [x] Verify the client error and server HTTP 500 locally through preview and the generated Azure Function wrapper under SWA. Run Svelte MCP autofixer on all changed components.
- [ ] Verify real client/server error ingestion and original source locations in Sentry with reporting enabled and freshly uploaded maps. UI instructions are in the demo README; automated tests disable reporting/upload. This is the remaining gate shared with steps 5–6.
- [ ] Run the suite against an actual Azure deployment in step 8 before treating Azure-specific expectations as verified.
- [ ] Do not remove `tests/demo-old` until replacement coverage is complete; then remove/archive it and clean obsolete paths and ignore patterns.

Step 7 local verification (2026-10-16): root check/lint and all 86 tests pass, with root implementation unchanged. Demo check has zero errors/warnings; 48 unit/browser/Storybook tests pass. Preview E2E: 23 pass, 17 Azure-specific cases intentionally skipped. Node 22.23.3 SWA/Functions E2E: all 40 pass, including all 16 header probes, `HelloWorld`, SSR/prerender/deep routes, forms/cookies and both error triggers. Svelte MCP autofixer reports no issues/suggestions on changed components. Third-party skill documentation is excluded from demo formatting because its illustrative code contains annotations that are not executable syntax. No live Sentry upload/ingestion verification, Azure deployment or legacy-demo deletion was performed.

### 8. Independent installs, CI, coverage and release flow

Files: root/demo `package.json`, `.github/workflows/ci.yml`, `.github/workflows/ci-swa.yml`, `.github/dependabot.yml`, `.githooks/pre-push`, `tests/coverage/mcr-report-swa.mjs`.

- [ ] Make CI install root and demo dependencies explicitly before demo build/check/test commands. Audit the shared `kt-workflows/actions` defaults; root `npm ci` alone no longer installs the demo.
- [ ] Include both lockfiles in the relevant dependency caches. Resolve Playwright/browser tools from the demo installation and provision Azure Functions Core Tools for local SWA runs.
- [ ] Align `*:all` commands, pre-push checks and release/version commands with independent dependency ownership. The demo currently has no `coverage` script although root `coverage:all` calls one: define the intended command or remove the stale aggregate.
- [ ] Fix coverage-tool ownership: `tests/coverage/mcr-report-swa.mjs` imports `monocart-coverage-reports` from a root-relative script, but the root does not declare it. Either declare it where the script lives or move/run the report in the project that owns the dependency.
- [ ] Reconcile V8 output paths, CDP teardown and `NODE_V8_COVERAGE` propagation; verify both build-phase and Function request coverage are collected and mapped to the right sources.
- [ ] Preserve local SWA and real Azure jobs, correct deployment static/API locations, Function production dependency installation, `PLAYWRIGHT_TEST_BASE_URL` handling and existing report/coverage artifacts.
- [ ] Keep Azure runtime selection separate from the build machine's Node version. Verify the deployed runtime meets Kit 3's minimum rather than assuming local Node 24 implies Azure Node 24 support.
- [ ] Configure Dependabot for all three independent npm manifests: `/`, `/tests/demo` and `/src/server/template`. Use cross-directory grouping by dependency name where appropriate so shared dependencies such as `@azure/functions` are updated together across the root peer dependency, demo dependency and generated Function runtime dependency. Decide deliberately how the retired demo is treated.
- [ ] Align `src/server/template/package.json` `@azure/functions` with the current root-supported version (`^4.16.5` at migration time); afterwards let Dependabot maintain the shared dependency across root/demo/template instead of synchronizing it with a custom script.
- [ ] Verify Dependabot/change-set behavior after removing the demo workspace: a root dependency update generates one patch changeset for the published adapter; a demo-only update generates no adapter changeset; and a grouped `@azure/functions` update changes root/demo/template together and generates the adapter changeset through the changed root manifest. Major dependency PRs remain manual-review cases rather than changing the generated changeset severity automatically.
- [ ] Exercise `npm pack` and install the resulting package in the demo or a temporary consumer, in addition to the local file dependency. Verify packaged imports/types/Function templates and absence of repository-only files.

### 9. Major release preparation

- [ ] Verify affected project specs/development notes and remove or update obsolete old-demo paths after the replacement coverage is complete.
- [ ] Add a major changeset for adapter 3.0.0 with the dependency/API breaking changes. Preserve published `src`, `README`, `LICENSE`, `CHANGELOG.md`, package exports and `main`/`types` metadata.
- [ ] Prepare release notes that clearly state the Kit 3-only compatibility boundary and the significant runtime/API changes without duplicating the full README rewrite in step 10.

### 10. README, positioning and discoverability

Execution note: treat this as a separate product/documentation review after the implementation, integration tests and release shape are stable. Use **High reasoning effort at minimum; Extra High is preferred if available**. Re-read the finished repository and reconsider the README structure from first principles rather than mechanically patching the current text.

- [ ] Rewrite the README for the finished 3.x adapter. Make the opening immediately establish the concrete use case and compatibility boundary: current SvelteKit 3, Azure Static Web Apps, server-side rendering/hybrid applications, Azure Functions v4 and the supported Node minimum.
- [ ] Rebuild the Quick Start and all configuration examples against the final Kit 3 Vite-plugin configuration model (`sveltekit({...})`), the scoped package name and the final public types. Verify every command/snippet against the finished demo/package rather than carrying forward Kit 2-era examples.
- [ ] Review every adapter option, default and documented behavior against the final implementation, including external dependencies, custom API/static paths, SWA routes, auth/client principal, emulation, instrumentation, server bundling and Sentry integration. Replace obsolete Sentry helper/upload guidance with the tested Sentry 11 flow.
- [ ] Audit feature/differentiator claims for technical ownership and usefulness. Do not present behavior supplied natively by SvelteKit as an adapter feature. In particular, client rebundling has been removed: describe client output/sourcemaps factually (the adapter copies Kit's generated output) and reserve adapter-specific claims for behavior the adapter actually provides, such as the Azure Functions server pipeline and any verified server sourcemap handling.
- [ ] Reconsider the overall README information architecture. Prefer a concise product/use-case introduction, compatibility, installation/configuration, generated deployment layout, options and verified Azure caveats over repeatedly explaining or defending the fork. Keep upstream history/acknowledgements factual and secondary.
- [ ] Review npm/package discoverability metadata after the final behavior is known: improve `package.json` `description` and `keywords` so that SvelteKit 3, Azure Static Web Apps, Azure Functions/SSR and the actual supported use cases are explicit without keyword stuffing.
- [ ] Review GitHub repository discoverability: update the repository About/description and add accurate topics (for example SvelteKit, Azure Static Web Apps, Azure Functions, SSR/serverless) based on the final positioning.
- [ ] Evaluate the README and metadata from common discovery intents such as “SvelteKit 3 Azure Static Web Apps adapter”, “SvelteKit Azure Functions SSR” and “SvelteKit Azure adapter”. A developer or AI agent should be able to determine from the README opening and package metadata what the adapter targets, whether it supports the current SvelteKit line, and how to install/configure it.
- [ ] Keep discoverability evidence-based: optimize for clear, specific facts and terminology rather than comparative claims against upstream or generic marketing language. Let the final review decide the exact wording and which differentiators are worth emphasizing.

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

## 1. Source type fixes (preconditions for the TS6 bump)

> **Hard rule for this change:** **DO NOT introduce any new `// @ts-expect-error`, `// @ts-ignore`, or `// @ts-nocheck` comments** to resolve a TS6 diagnostic. Each new diagnostic MUST be resolved by fixing the underlying type, control flow, or guard. If a fix is non-obvious, surface it for discussion rather than suppressing.
>
> Two pre-existing suppressions are out of scope for this change and MUST NOT be modified or removed:
>
> - [src/types/swa.d.ts:3](../../../src/types/swa.d.ts#L3) — schema-level cast for `node:22` runtime not yet in upstream schema
> - [src/server/entry/headers.js:25](../../../src/server/entry/headers.js#L25) — cookie `sameSite` type mismatch
>
> They are documented and intentional. A future PR may revisit them once upstream schemas catch up.

- [ ] 1.1 Fix `src/emulator/index.js:47`: restructure the `if (clientPrincipal)` block so `user` is built in a single object literal, with `claimsPrincipalData` lifted into a `const` initialized via a ternary on `'claims' in clientPrincipal`. This avoids the TS6 control-flow narrowing regression. Do NOT modify `src/index.d.ts` — `App.Platform.user: HttpRequestUser | null` is correct (per [Azure SWA docs](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information): anonymous requests have `user === null`), and `claimsPrincipalData` is already declared upstream on `HttpRequestUser` in `@azure/functions`.
- [ ] 1.2 Fix `src/server/entry/entry.js:16` (`server.init({ env: process.env })`) by adding a JSDoc cast `/** @type {Record<string, string>} */ (process.env)`. Confirm no behavioral change vs. SvelteKit's documented `server.init` contract.
- [ ] 1.3 Fix `src/server/entry/entry.js:111` (`new Request(originalUrl, …)`): add an early `if (!originalUrl) throw new Error('x-ms-original-url header missing — Azure SWA misconfiguration')` before the `new Request(...)` call. Place the guard right after the existing header reads so the stack trace is informative.
- [ ] 1.4 Fix `src/swa-config/index.js:88` (`swaConfig.routes.push(...)`): add `swaConfig.routes ??= [];` immediately before the push. Match `staticwebapp.config.json` schema (routes is optional).
- [ ] 1.5 Fix `src/utils.js:72` JSDoc on the lazy-init `mapSource2JSDir` from `/** @type {Map<string, string>} */` to `/** @type {Map<string, string> | undefined} */`. No runtime change.
- [ ] 1.6 Fix `src/utils.js` `loadMapSource2JSDir(dirs, log)` JSDoc to mark `log` optional: `@param {Console['log']} [log] logger function (optional — internal calls already use \`log?.(...)\`)`. Verify body already uses `log?.(...)` on every call.
- [ ] 1.7 Run `node_modules/.bin/tsc --skipLibCheck --noEmit` (or `npm run check` once 2.x is done) — must exit 0 with no `error TS` lines.

## 2. Toolchain bump

- [ ] 2.1 Update `devDependencies.typescript` in `package.json` from `^5.9.3` to `^6.0.3`.
- [ ] 2.2 Run `npm install` and commit the resulting `package-lock.json` (workspaces lockfile is shared at root).
- [ ] 2.3 Update `scripts.check` from `"tsc --skipLibCheck --noEmit"` to `"tsc --project tsconfig.json --noEmit"`.
- [ ] 2.4 Verify `scripts.check:test` does not exist for this repo (root has only `check`); if it does, drop the `--skipLibCheck` flag from it. (Spec mentions both for forward-compat.)
- [ ] 2.5 Confirm `tsconfig.json` already carries `skipLibCheck: true` so the CLI flag is genuinely redundant. (It does — verified.)

## 3. Published-tarball polish

- [ ] 3.1 Update `package.json` `files` from `["src"]` to `["src", "CHANGELOG.md"]`.
- [ ] 3.2 Run `npm pack --dry-run --ignore-scripts`; verify `CHANGELOG.md` appears in the listed contents and no `tests/`, `openspec/`, `.github/`, `.changeset/`, or `scripts/` paths leak through.

## 4. Verification (full battery, local)

- [ ] 4.1 `npm run check` exits 0 (root, against TS6).
- [ ] 4.2 `npm run check:all` exits 0 (root + workspaces; demo is svelte-check, not TS6-affected — but make sure nothing else regressed).
- [ ] 4.3 `npm run lint` and `npm run lint:all` exit 0.
- [ ] 4.4 `npm run test` exits 0.
- [ ] 4.5 `npm pack --dry-run --ignore-scripts` lists `CHANGELOG.md`, `LICENSE`, `README.md`, `package.json`, and `src/**` only.
- [ ] 4.6 Confirm zero NEW diagnostic-suppression comments were added by this change: `git diff main -- src/ | grep -E '^\+.*@ts-(expect-error|ignore|nocheck)'` MUST return nothing. (The two pre-existing suppressions in `swa.d.ts` and `headers.js` are out of scope and remain untouched — `^\+` ensures we only flag added lines.)

## 5. Changeset + PR plumbing

- [ ] 5.1 Author one new patch changeset at `.changeset/<descriptive-slug>.md` capturing the user-visible change: TS6 support, `CHANGELOG.md` shipped in tarball, `check` script tightened. Do NOT mention the source fixes individually — they are bug fixes that became visible only because of the TS6 bump.
- [ ] 5.2 Run `./scripts/push-update.sh "fix: typescript 6 support; ship CHANGELOG.md in tarball"`. Verify the working dir is `svelte-adapter-azure-swa` (not the primary repo `npm-typescript-template`) **before** running.
- [ ] 5.3 Open PR `contribution → main` titled `fix: typescript 6 support; ship CHANGELOG.md in tarball`. Reference dependabot #237 in the body.

## 6. Land

- [ ] 6.1 Wait for **all** CI checks to pass on the PR — no `--admin` shortcut.
- [ ] 6.2 Once green, `gh pr merge <n> --squash`. (No `--delete-branch` — `contribution` is the working branch.)
- [ ] 6.3 Close dependabot #237 with a comment pointing to the merged PR (`gh pr close 237 --comment "Superseded by #<n>; that PR carries the bump plus the prerequisite type fixes."`).
- [ ] 6.4 Wait for the changesets bot to update the existing `Version Packages` PR #235 with our changeset alongside the two pending ones.
- [ ] 6.5 Wait for that PR's CI green; merge with `gh pr merge 235 --squash` (no `--admin`). Wait for `Release` workflow to finish.
- [ ] 6.6 Verify publish: `npm view @ktarmyshov/svelte-adapter-azure-swa@latest version` returns the expected `1.1.1` (or the next patch). Sanity-install in `/tmp` and confirm `CHANGELOG.md` is on disk.

## 7. Cleanup

- [ ] 7.1 `cd /Users/d050316/SAPDevelop/git/personal/kt-npm-modules/svelte-adapter-azure-swa && ./scripts/contribution-reset.sh`.
- [ ] 7.2 `npm uninstall typescript --no-save` if any stray `node_modules` state remains from the local TS6 spike (the lockfile bump from 2.2 is the source of truth now). Re-run `npm ci` to reset.
- [ ] 7.3 Archive this OpenSpec change via `/opsx:archive upgrade-typescript-6`.

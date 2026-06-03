## Why

The repo is wedged on the dependabot TypeScript bump PR #237 (5.9.3 → 6.0.3): TypeScript 6 has tightened `checkJs` soundness and now reports six real type errors in `src/*.js` that TS 5.9 silently allowed. Each is a latent runtime bug (null-header, optional-route, undefined-callback). At the same time the published tarball is missing `CHANGELOG.md` (npm only auto-includes README and LICENSE) and the `check` script is implicit (`tsc --skipLibCheck --noEmit` without `--project`). All four issues are small but coupled — fixing them piecemeal would either leave dependabot's PR red or split a single semantic patch across multiple releases.

## What Changes

- Fix six TS6-surfaced JSDoc/type errors in `src/emulator/index.js`, `src/server/entry/entry.js`, `src/swa-config/index.js`, and `src/utils.js` (each closes a real latent edge case).
- Bump `typescript` devDependency to `^6.0.3`.
- Add `CHANGELOG.md` to `package.json` `files` so it ships in the npm tarball.
- Drop the redundant `--skipLibCheck` flag from `check` and `check:test` (the root tsconfig already sets it) and pin `check` to an explicit `--project tsconfig.json`.
- Close dependabot PR #237 in favour of this one (it carries the bump + the prerequisite fixes that #237 alone cannot resolve).

No public API changes. No engines change. Demo workspaces (`tests/demo/`) untouched — they use `svelte-check` and SvelteKit-generated tsconfigs.

## Capabilities

### New Capabilities

- `published-package-contents`: defines what the npm tarball published from this repo MUST contain. Initially scopes the inclusion of `CHANGELOG.md` (which npm does not auto-include the way it does `README` / `LICENSE`).

### Modified Capabilities

- `build-tooling-tsconfig`: bumps the supported TypeScript major to `^6.0.3`; tightens the `check` and `check:test` script invocations to use explicit `--project` and drop the redundant `--skipLibCheck` (now sourced from the tsconfig).

## Impact

- **Source code**: 6 small JSDoc/control-flow fixes under `src/`. No behavioral change observable to consumers — each fix narrows a type that TS6 surfaced and adds a guard or default for the previously-implicit edge case.
- **`package.json`**: `files`, `scripts.check`, `scripts.check:test`, `devDependencies.typescript`.
- **PRs**: closes dependabot #237 (TypeScript bump). Existing pending changesets (`migrate-coverage-v8`, `migrate-tsconfig-nodenext`) remain unaffected and will release in the same wave.
- **Release**: patch bump (`1.1.0` → `1.1.1`) coordinated through changesets; consolidates with the two pending changesets into one Version Packages PR.
- **CI**: `npm run check` against TS6 now passes; demo workspace check is untouched.

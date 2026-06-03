## Context

The dependabot bump PR #237 (`typescript` 5.9.3 → 6.0.3) has been failing CI on `npm run check` since it landed. Local repro with `typescript@^6.0.3` confirms the same six errors and **only** those six — no upstream/dependency cascades, no demo-workspace regressions (the demo uses `svelte-check` against its own SvelteKit-generated tsconfig, untouched by this change).

Each of the six errors is a real latent issue:

| #   | Site                            | Root cause                                                                                                                                                                          | Latent risk                                                                                                                                                |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/emulator/index.js:47`      | `App.Platform.user` is typed as `HttpRequestUser \| null` but the codebase mutates it as if it had `claimsPrincipalData`. The custom field is set in two places but never declared. | Type liar — `claimsPrincipalData` is read by hooks downstream; consumers reading `event.platform.user.claimsPrincipalData` get a TS error from their side. |
| 2   | `src/server/entry/entry.js:16`  | `process.env` (`Record<string, string \| undefined>`) is fed into SvelteKit `Server.init({ env: Record<string, string> })`.                                                         | Already de-facto unsafe; SvelteKit treats missing values as empty string. Just needs a JSDoc cast or filter.                                               |
| 3   | `src/server/entry/entry.js:111` | `httpRequest.headers.get('x-ms-original-url')` returns `string \| null`; passed unguarded to `new Request(originalUrl, ...)`.                                                       | Crash with cryptic `TypeError: Failed to construct 'Request'` if Azure forgets the header.                                                                 |
| 4   | `src/swa-config/index.js:88`    | `staticwebapp.config.json` schema declares `routes` optional. Existing code does `swaConfig.routes.push(...)` unconditionally.                                                      | Crash if `customStaticWebAppConfig` is provided without a `routes` array.                                                                                  |
| 5   | `src/utils.js:72`               | `let mapSource2JSDir = undefined` annotated as `Map<string, string>` (no `\| undefined`).                                                                                           | None at runtime — narrow JSDoc typo.                                                                                                                       |
| 6   | `src/utils.js:80`               | `loadMapSource2JSDir(dirs, log)` declares `log: Console['log']` (required), but caller passes `options?.log` which may be `undefined`.                                              | Crash if `options.log` is unset and the helper internally calls `log(...)` (it does, three times).                                                         |

In addition, the published tarball has been missing `CHANGELOG.md` since the package's inception — a `files: ["src"]` whitelist masks the changelog because npm only auto-includes README and LICENSE.

The repo also has two pending changesets unrelated to this work (`migrate-coverage-v8`, `migrate-tsconfig-nodenext`); they are already in the bot's `Version Packages` PR and will release in the same wave.

## Goals / Non-Goals

**Goals:**

- Make `npm run check` pass under `typescript@^6.0.3`.
- Land the TS6 bump as a single coherent change instead of leaving #237 stuck.
- Ship `CHANGELOG.md` in the published tarball.
- Tighten `check` / `check:test` script invocations to mirror the rest of `kt-npm-modules` (no implicit `tsconfig.json`, no redundant `--skipLibCheck`).
- Fix each TS6-surfaced error at its **source** (correct type / add guard / add fallback) rather than suppressing the diagnostic.

**Non-Goals:**

- No engines change (`>=20 <21 || >=22 <23` stays — Azure SWA only supports Node 20 and 22).
- No demo workspace edits — `tests/demo/` uses `svelte-check`, not root `tsc`, and its own tsconfig is fine.
- No new public API. The `App.Platform.user` shape correction is a TYPE fix, not a runtime change — the field has been written all along; only the declared type was wrong.
- No spec change for the six runtime fixes — they restore parity between code and intent. Only `build-tooling-tsconfig` (TS major bump, script invocation) and a new `published-package-contents` capability (tarball includes CHANGELOG) carry spec deltas.
- No dependabot rebase. PR #237 is closed in favour of this PR (which also bumps to `^6.0.3`).

## Decisions

### Decision: Fix each TS6 error at the source, not via `// @ts-expect-error`

**Why:** Five of the six are real issues (latent `null` deref, missing field type, optional `routes`, optional `log` callback). Suppressing them would defeat the whole point of bumping TS, which is to catch exactly these cases.

**Alternatives considered:**

- Add `// @ts-expect-error` lines to keep the bump diff small. **Rejected** — encodes "we know this is wrong" into the source, defeats `checkJs`.
- Loosen `tsconfig.json` (`strict: false` or `checkJs: false`). **Rejected** — same reason, but worse: it would also hide future bugs.

### Decision: Fix `App.Platform.user` type in `src/index.d.ts`, not narrow at the call site

The declared type `HttpRequestUser | null` does not match the runtime shape that the emulator and the server entry both construct (which carries `claimsPrincipalData`). Fixing it once in `src/index.d.ts` propagates correctly to both call sites and to consumers reading `event.platform.user.claimsPrincipalData` from their own SvelteKit hooks.

**Concrete approach:** declare a small intersection type (or extend `HttpRequestUser`) so that `claimsPrincipalData: Record<string, string>` is part of the published type surface. The runtime initialization (`claimsPrincipalData: {}`) at `src/emulator/index.js:46` already matches that shape.

**Trade-off:** because `App.Platform` is in the global `App` namespace, this is technically a public-type-surface widening. Consumers who were destructuring `user` and inferring its type were already getting back something with `claimsPrincipalData` at runtime; their code now type-checks. Nobody is broken.

### Decision: Use a JSDoc cast for `process.env` rather than filter

`server.init({ env: /** @type {Record<string, string>} */ (process.env) })`.

**Why:** SvelteKit accepts the input as-is; it treats `undefined` values as empty strings. Filtering would burn an unnecessary allocation per cold start and shift behavior (env vars set to `""` would now be missing instead of empty). The cast is the smallest correct fix.

### Decision: Crash early on missing `x-ms-original-url`, do not fall back to `httpRequest.url`

The header is set by Azure SWA on every request that reaches a managed Function. A request reaching the function without it indicates configuration drift (the function was invoked outside SWA, or SWA misconfigured its rewrites). Falling back to `httpRequest.url` would silently route through the wrong origin.

**Concrete approach:** `if (!originalUrl) throw new Error('x-ms-original-url header missing — Azure SWA misconfiguration')`. This is the same shape that other Azure-only adapters use.

### Decision: Default `swaConfig.routes` to `[]` before push

`swaConfig.routes ??= [];` then push. Matches the JSON schema (which makes `routes` optional) and prevents a crash if the user passes `customStaticWebAppConfig: {}`.

### Decision: Tighten JSDoc on `loadMapSource2JSDir(log)` to optional

The helper internally does `log?.(...)` — it already handles missing log. The bug is only in the parameter type. Change `@param {Console['log']} log` → `@param {Console['log']} [log]`.

### Decision: Initialize `mapSource2JSDir` lazily as `Map<string, string> | undefined`

Tiny JSDoc widening on the `let` declaration. The lazy-init pattern (check, build, cache) is intentional and untouched.

### Decision: One PR, three changesets aliased into one

A single PR carrying 6 source fixes + the TS bump + the `files`/`check` polish. Author **one** new changeset for this work; the existing two pending changesets (`coverage-v8`, `tsconfig-nodenext`) ride along untouched. The bot's `Version Packages` PR will consolidate the lot into a single `1.1.1` release entry.

**Alternatives considered:**

- Two PRs: source fixes + bump first, polish second. **Rejected** — splits a coherent semantic change, doubles the CI / release cycle.
- Cherry-pick into dependabot's #237. **Rejected** — dependabot will rebase and clobber; easier to close #237 and own the bump.

## Risks / Trade-offs

- **Risk:** `App.Platform.user` type widening could surprise consumers who were depending on the narrower `HttpRequestUser | null` shape. → **Mitigation:** the field was already populated at runtime, so consumers reading it were already getting `claimsPrincipalData`; the widening only makes the TS type honest. Worst-case impact is forward — consumers can now type-check `user.claimsPrincipalData`.
- **Risk:** `throw` on missing `x-ms-original-url` changes failure mode from cryptic (`TypeError: ...`) to typed (`Error: x-ms-original-url header missing — Azure SWA misconfiguration`). → **Mitigation:** this is an improvement in observability, not a regression. The condition was already a bug.
- **Risk:** Bumping TS major in devDeps could shift downstream `tsc` / `tsserver` behavior for IDE users running this repo's check. → **Mitigation:** we run the full local `tsc --skipLibCheck --noEmit` and `svelte-check` against TS6 before merge; the change is opt-in for any editor pinning a workspace TS.
- **Risk:** `CHANGELOG.md` adoption changes the published tarball size by ~12 kB. → **Trade-off accepted:** the changelog is core release metadata; missing it from the tarball is the bug we're fixing.

## Migration Plan

1. Fix the six source errors (atomic per file, no cross-file dependencies).
2. Bump `typescript` in `devDependencies`, `npm install`, commit.
3. Update `files`, `scripts.check`, `scripts.check:test` in `package.json`.
4. Author a single patch changeset capturing the user-visible part (CHANGELOG inclusion + script tightening; the source fixes are silent and don't need separate mention).
5. Push `contribution`, open PR vs. `main`.
6. Wait for CI green (incl. `check` on Node 20 and 22) — **no `--admin` shortcut**.
7. Merge. Close dependabot #237 with a comment pointing to the merged PR.
8. Wait for changesets bot to update the `Version Packages` PR (#235 — already open, will absorb our changeset alongside the two pending).
9. Wait for that PR's CI green; merge; release workflow publishes `@ktarmyshov/svelte-adapter-azure-swa@1.1.1`.
10. Local `./scripts/contribution-reset.sh`.

**Rollback:** if release publish fails, the released tarball is unaffected (changesets only publishes after merge). If a consumer reports the type widening breaks them, follow up with a 1.1.2 narrowing the type back behind a deprecation notice — but the runtime change has been live since first release, so this is unlikely.

## Open Questions

None. The scope is concrete and the 6-error perimeter matches both CI and local TS6 runs exactly.

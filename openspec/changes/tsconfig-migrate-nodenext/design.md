## Context

The package's root [tsconfig.json](tsconfig.json) currently sets `"module": "esnext"` and `"moduleResolution": "node"`. That pairing was the right choice when TypeScript first added ESM output but pre-dates Node's native ESM rules. The package today is unambiguously Node-ESM:

- `package.json` has `"type": "module"`, an `exports` map, and `"engines": { "node": ">=20 <21 || >=22 <23" }`.
- Every relative import in [src/](src/) is already written with an explicit `.js` extension (verified via `grep`).
- Imports use `node:`-prefixed specifiers (`node:path`, etc.), which `moduleResolution: node` does not understand as a first-class form.
- The build is checker-only (`noEmit: true`); `tsc` validates JSDoc-typed `.js` plus a few `.d.ts` files. Nothing in this repo emits compiled output from `tsc`.

`nodenext` is the mode TypeScript ships specifically for this shape: it picks ESM vs CJS per-file from `package.json`/file extension, requires explicit relative file extensions, honors the `exports` map, and resolves `node:` specifiers correctly. Switching aligns the type-checker with how Node actually loads the code.

The sibling [tests/demo/tsconfig.json](tests/demo/tsconfig.json) extends SvelteKit's generated `.svelte-kit/tsconfig.json` and uses `moduleResolution: bundler` on purpose — that file is out of scope.

## Goals / Non-Goals

**Goals:**
- Type-check the package under module/resolution semantics that match Node's runtime ESM loader.
- Catch real ESM-resolution mistakes at `tsc` time (missing extensions, bad CJS-default imports, paths that exist on disk but aren't in `exports`).
- Keep `npm run check` green at the end of the change. CI must continue to pass.
- Make zero observable changes to published artifacts (`src/**` is what ships; `noEmit` stays true).

**Non-Goals:**
- Rewriting source from JSDoc-typed `.js` to `.ts`.
- Touching `tests/demo/*` or `.svelte-kit/*` tsconfigs.
- Introducing a build/emit step or changing `target`/`lib`.
- Adjusting `package.json` `exports`, `main`, `module`, or `types` fields.

## Decisions

### Decision 1: Set both `module` and `moduleResolution` to `nodenext`

Use `"module": "nodenext"` and `"moduleResolution": "nodenext"` together.

**Rationale**: TypeScript treats these as a paired mode. `nodenext` tracks Node's evolving ESM rules and is the documented choice for packages that publish ESM and target current Node LTS. The package's `engines` already pins Node 20/22, and Node 20+ supports the resolution features `nodenext` validates against.

**Alternatives considered:**
- **`"module": "node20"` / `"moduleResolution": "node20"`** — Pins to Node 20 semantics. Rejected: the package supports both 20 and 22, and there is no reason to lag behind Node's current behavior.
- **`"module": "esnext"` + `"moduleResolution": "bundler"`** — Used by the demo because Vite/SvelteKit bundle. Rejected for the package: nothing bundles `src/` before publish; consumers receive raw `.js` and load it through Node's resolver, so `bundler` would lie about what works at runtime.
- **Leave as-is (`esnext` + `node`)** — Rejected: see proposal motivation. The current pairing under-checks ESM resolution.

### Decision 2: Fix new diagnostics in place; do not suppress

If `nodenext` surfaces errors, fix the source rather than adding `// @ts-ignore`, `skipLibCheck` exceptions, or downgrading the option. Expected categories:
- Missing `.js` extensions on relative imports — add the extension.
- CJS-default-import shape mismatches — switch to namespace import or named import as the dependency requires (`allowSyntheticDefaultImports` stays on, which covers most cases).
- `package.json` `exports` reachability — if a file is imported that isn't in `exports`, either add it or change the import.

A spot-check (`grep` for relative imports without `.js`) already shows the source side is clean, so most/all changes will be in dependency typings — handled via `skipLibCheck` already in `npm run check`.

### Decision 3: Scope is the root tsconfig only

[tests/demo/tsconfig.json](tests/demo/tsconfig.json) and [tests/demo/.svelte-kit/tsconfig.json](tests/demo/.svelte-kit/tsconfig.json) stay on `bundler`. They serve a different toolchain (Vite + SvelteKit) where `bundler` is correct.

## Risks / Trade-offs

- **Risk**: `nodenext` surfaces errors in transitive `.d.ts` from dependencies.
  - **Mitigation**: `npm run check` already passes `--skipLibCheck`; library-type errors are out of scope for the project's type-check step.
- **Risk**: A relative import somewhere in `src/` is missing a `.js` extension and was being silently resolved by `moduleResolution: node`.
  - **Mitigation**: Run `npm run check` after the config change; fix any reported missing extensions. Pre-flight `grep` indicates this is unlikely.
- **Risk**: A future contributor edits the root tsconfig back to `node` resolution out of habit.
  - **Mitigation**: The new `build-tooling-tsconfig` spec captures the requirement so the choice is recorded, not just implicit.
- **Trade-off**: `nodenext` is a "moving target" — TypeScript may tighten its semantics in future versions. Acceptable: the package pins TypeScript via `devDependencies` and we control upgrade timing.

## Migration Plan

1. Edit `compilerOptions` in [tsconfig.json](tsconfig.json): set `module` and `moduleResolution` to `nodenext`.
2. Run `npm run check` from the repo root.
3. If any errors appear, fix them at the source per Decision 2, then re-run.
4. Verify `npm run lint` and `npm test` still pass (sanity, neither depends on this config).
5. Open a changeset entry only if a consumer-visible change occurred (none expected — this is internal tooling).

**Rollback**: revert the single-file edit to [tsconfig.json](tsconfig.json). No downstream artifacts change, so rollback is a one-line revert with no migration cost.

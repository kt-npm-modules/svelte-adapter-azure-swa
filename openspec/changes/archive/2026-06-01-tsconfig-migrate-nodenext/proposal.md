## Why

The root `tsconfig.json` uses `"module": "esnext"` with `"moduleResolution": "node"` — a combination that no longer matches how this package actually ships and runs. The package is published as a pure ESM module (`"type": "module"`, Node `>=20`), and its source uses `node:` specifiers and `.js` extensions on every relative import. TypeScript's `nodenext` module/resolution mode is the option specifically designed for this layout: it enforces ESM-correct import semantics (mandatory file extensions, package `exports` map awareness, conditional resolution) so the type-checker validates code the same way Node actually loads it. Migrating closes the gap between what `tsc --noEmit` checks and what Node executes.

## What Changes

- Update root [tsconfig.json](tsconfig.json) `compilerOptions`:
  - `"module": "esnext"` → `"module": "nodenext"`
  - `"moduleResolution": "node"` → `"moduleResolution": "nodenext"`
- Keep `target`, `lib`, `allowJs`, `checkJs`, `noEmit`, `noImplicitAny`, `allowSyntheticDefaultImports`, and `include` unchanged.
- Fix any new diagnostics surfaced by `npm run check` after the switch (e.g. missing `.js` extensions on relative imports, `import` of CJS modules without default-interop, `package.json` `exports` mismatches).
- Leave [tests/demo/tsconfig.json](tests/demo/tsconfig.json) alone — it extends SvelteKit's generated config and intentionally uses `moduleResolution: bundler`. This proposal is scoped to the package's own type-check config.

## Capabilities

### New Capabilities

- `build-tooling-tsconfig`: Conventions for the package's root TypeScript configuration — module/resolution mode, what it must enforce, and how it relates to the runtime/publish format.

### Modified Capabilities

<!-- None — this change does not alter user-facing adapter behavior. -->

## Impact

- **Affected files**: [tsconfig.json](tsconfig.json), and any `.js`/`.d.ts` under [src/](src/) that fails the stricter ESM resolution and needs an explicit `.js` extension or import-style fix.
- **Affected scripts**: `npm run check` (`tsc --skipLibCheck --noEmit`) — must remain green after the change. CI runs this.
- **APIs**: None. The package's public exports, runtime behavior, and emitted output are unchanged (`noEmit` is true; this is a checker-only config).
- **Consumers**: No effect — this changes how _we_ type-check, not what we ship.
- **Dependencies**: No new dependencies. TypeScript `^5.9.3` already supports `nodenext`.

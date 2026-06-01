# build-tooling-tsconfig Specification

## Purpose

Defines the package's root TypeScript configuration policy for `svelte-adapter-azure-swa`. The capability scopes the root `tsconfig.json` (used by `npm run check`) to the `nodenext` module/resolution mode, keeps it checker-only (`noEmit: true`) over the hand-authored ESM source under `src/`, and pins the corresponding source-side import conventions (explicit relative extensions, `node:` prefix on built-ins, CJS-shape-compatible interop). The demo workspace under `tests/demo/` is explicitly out of scope and continues to be governed by SvelteKit's generated bundler-mode tsconfig.

## Requirements

### Requirement: Root tsconfig uses nodenext module mode

The package's root `tsconfig.json` (at the repository root, used by `npm run check`) SHALL set `compilerOptions.module` to `"nodenext"` and `compilerOptions.moduleResolution` to `"nodenext"`. These two options MUST be kept in sync; mixing `nodenext` with any other module/resolution mode is not permitted.

#### Scenario: Config values are nodenext

- **WHEN** the root `tsconfig.json` is loaded
- **THEN** `compilerOptions.module` equals `"nodenext"`
- **AND** `compilerOptions.moduleResolution` equals `"nodenext"`

#### Scenario: Type-check passes under nodenext

- **WHEN** `npm run check` is executed at the repository root
- **THEN** `tsc --skipLibCheck --noEmit` exits with code 0 against the source under `src/`

### Requirement: Root tsconfig is checker-only

The root `tsconfig.json` SHALL NOT emit JavaScript. `compilerOptions.noEmit` MUST remain `true`. The package's published JavaScript is the hand-authored `.js` under `src/`; TypeScript is used only to validate JSDoc-typed sources and `.d.ts` files.

#### Scenario: noEmit stays enabled

- **WHEN** the root `tsconfig.json` is loaded
- **THEN** `compilerOptions.noEmit` equals `true`

### Requirement: Source ESM imports stay nodenext-compatible

Source files under `src/` SHALL use ESM import forms that resolve correctly under `module: nodenext`:

- Relative imports MUST include an explicit file extension (e.g. `.js`, `.d.ts`).
- Node built-in imports MUST use the `node:` specifier prefix (e.g. `node:path`, not `path`).
- Imports of CJS dependencies MUST use a form supported by the dependency's actual export shape (named, namespace, or default via `allowSyntheticDefaultImports`).

#### Scenario: Relative import has explicit extension

- **WHEN** a file in `src/` imports another file in `src/`
- **THEN** the import specifier ends in `.js` (or another explicit extension that exists on disk)

#### Scenario: Node built-in uses node: prefix

- **WHEN** a file in `src/` imports a Node built-in module
- **THEN** the import specifier starts with `node:`

### Requirement: Demo tsconfig is out of scope

The TypeScript configuration under `tests/demo/` SHALL remain governed by SvelteKit's generated `.svelte-kit/tsconfig.json` and SHALL continue to use `moduleResolution: "bundler"`. This requirement does not apply to the demo or any other workspace tsconfig that exists to serve a bundler-driven toolchain.

#### Scenario: Demo tsconfig is unchanged by this capability

- **WHEN** the root tsconfig is reconfigured per this capability
- **THEN** `tests/demo/tsconfig.json` retains `moduleResolution: "bundler"`
- **AND** `tests/demo/tsconfig.json` continues to extend `./.svelte-kit/tsconfig.json`

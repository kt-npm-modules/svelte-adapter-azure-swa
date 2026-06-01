## 1. Pre-flight checks

- [x] 1.1 Confirm baseline: run `npm run check` on the current `tsconfig.json` and record that it passes (so post-change diagnostics can be attributed correctly).
- [x] 1.2 Confirm TypeScript version supports `nodenext` (already `^5.9.3` in [package.json](package.json) — verify still installed via `npx tsc --version`).
- [x] 1.3 Spot-check `src/` for relative imports missing `.js` extensions (`grep -rE "from '\\.\\.?/[^']*'" src/ | grep -v "\\.js'"`); if any are found, list them — they will need fixing in step 3.
  - Found: `src/index.d.ts:4` (`./types/swa`), `src/index.d.ts:6` (`./types/swa`), `src/server/entry/entry.js:11` (`./headers`).

## 2. Update root tsconfig

- [x] 2.1 In [tsconfig.json](tsconfig.json), change `"module": "esnext"` to `"module": "nodenext"`.
- [x] 2.2 In [tsconfig.json](tsconfig.json), change `"moduleResolution": "node"` to `"moduleResolution": "nodenext"`.
- [x] 2.3 Leave `target`, `lib`, `allowJs`, `checkJs`, `noEmit`, `noImplicitAny`, `allowSyntheticDefaultImports`, and `include` unchanged.
- [x] 2.4 Do **not** modify [tests/demo/tsconfig.json](tests/demo/tsconfig.json) or anything under [tests/demo/.svelte-kit/](tests/demo/.svelte-kit/).

## 3. Resolve diagnostics

- [x] 3.1 Run `npm run check`. Capture the full diagnostic output if non-empty.
  - Captured: 33 errors. Two root causes: (a) JSDoc `import('.')` / `import('..')` directory specifiers (4 sites) — `nodenext` requires explicit `./index.js` / `../index.js`; (b) the 3 missing-extension sites identified in 1.3. Many cascading "implicit any" errors flowed from (a).
- [x] 3.2 For each "relative import is missing file extension" error, add the explicit `.js` extension at the import site.
  - Fixed: [src/index.d.ts](src/index.d.ts) (`./types/swa` → `./types/swa.js`, both occurrences), [src/server/entry/entry.js](src/server/entry/entry.js) (`./headers` → `./headers.js`).
- [x] 3.3 For each "module has no default export" / CJS-interop error, switch the import to a namespace or named-import form supported by the dependency's actual shape.
  - None encountered.
- [x] 3.4 For any other class of error, fix at the source — do **not** add `// @ts-ignore` or downgrade the option.
  - Fixed JSDoc `import('.')` directory specifiers to explicit `./index.js` / `../index.js` in [src/index.js](src/index.js), [src/utils.js](src/utils.js), [src/emulator/index.js](src/emulator/index.js) (uses `./index.js` because the JSDoc `import` is resolved relative to the file, and the ambient `.d.ts` is `src/emulator/index.d.ts`), [src/client/index.js](src/client/index.js).
- [x] 3.5 Re-run `npm run check` until it exits cleanly.

## 4. Verification

- [x] 4.1 `npm run check` exits with code 0.
- [x] 4.2 `npm run lint` exits with code 0.
  - Note: 1 pre-existing ESLint warning in [src/types/swa-config-gen.d.ts](src/types/swa-config-gen.d.ts) (unused eslint-disable directive in a generated file); unrelated to this change. `npm run format` was run to fix Prettier formatting on the new openspec artifacts and on [src/index.d.ts](src/index.d.ts).
- [x] 4.3 `npm test` exits with code 0.
  - 4 test files / 58 tests passed.
- [x] 4.4 Confirm the published shape is unchanged: `package.json` `main`/`module`/`types`/`exports` are not modified, and `src/` source files compile/type-check identically aside from any extension fixes from step 3.
  - `package.json` is untouched. `src/**` runtime semantics are unchanged: edits were either type-only (`.d.ts`, JSDoc comments) or added `.js` to a relative import that already pointed at the same target file under Node's ESM loader.

## 5. Wrap-up

- [x] 5.1 Stage the diff (`tsconfig.json` plus any source fixes from step 3) and review it.
  - Reviewed: 11 files, +45/-26. Source changes are 6 lines across 6 files (5× JSDoc/import path fixes, 1× tsconfig 2-line change). Remaining diff is tasks/proposal/design/spec markdown.
- [x] 5.2 Decide on a changeset entry: this is internal tooling with no consumer-facing change, so skip the changeset unless step 3 produced a fix that affected publishable behavior.
  - Decision: skip. All `src/` edits are type-only (JSDoc, `.d.ts`) or extension-additions where Node's ESM loader resolved the same target either way. No runtime behavior changes; `package.json` exports unchanged.
- [ ] 5.3 Run `/opsx:archive tsconfig-migrate-nodenext` once the change is merged.

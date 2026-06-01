## 1. Pre-flight checks

- [ ] 1.1 Confirm baseline: run `npm run check` on the current `tsconfig.json` and record that it passes (so post-change diagnostics can be attributed correctly).
- [ ] 1.2 Confirm TypeScript version supports `nodenext` (already `^5.9.3` in [package.json](package.json) — verify still installed via `npx tsc --version`).
- [ ] 1.3 Spot-check `src/` for relative imports missing `.js` extensions (`grep -rE "from '\\.\\.?/[^']*'" src/ | grep -v "\\.js'"`); if any are found, list them — they will need fixing in step 3.

## 2. Update root tsconfig

- [ ] 2.1 In [tsconfig.json](tsconfig.json), change `"module": "esnext"` to `"module": "nodenext"`.
- [ ] 2.2 In [tsconfig.json](tsconfig.json), change `"moduleResolution": "node"` to `"moduleResolution": "nodenext"`.
- [ ] 2.3 Leave `target`, `lib`, `allowJs`, `checkJs`, `noEmit`, `noImplicitAny`, `allowSyntheticDefaultImports`, and `include` unchanged.
- [ ] 2.4 Do **not** modify [tests/demo/tsconfig.json](tests/demo/tsconfig.json) or anything under [tests/demo/.svelte-kit/](tests/demo/.svelte-kit/).

## 3. Resolve diagnostics

- [ ] 3.1 Run `npm run check`. Capture the full diagnostic output if non-empty.
- [ ] 3.2 For each "relative import is missing file extension" error, add the explicit `.js` extension at the import site.
- [ ] 3.3 For each "module has no default export" / CJS-interop error, switch the import to a namespace or named-import form supported by the dependency's actual shape.
- [ ] 3.4 For any other class of error, fix at the source — do **not** add `// @ts-ignore` or downgrade the option.
- [ ] 3.5 Re-run `npm run check` until it exits cleanly.

## 4. Verification

- [ ] 4.1 `npm run check` exits with code 0.
- [ ] 4.2 `npm run lint` exits with code 0.
- [ ] 4.3 `npm test` exits with code 0.
- [ ] 4.4 Confirm the published shape is unchanged: `package.json` `main`/`module`/`types`/`exports` are not modified, and `src/` source files compile/type-check identically aside from any extension fixes from step 3.

## 5. Wrap-up

- [ ] 5.1 Stage the diff (`tsconfig.json` plus any source fixes from step 3) and review it.
- [ ] 5.2 Decide on a changeset entry: this is internal tooling with no consumer-facing change, so skip the changeset unless step 3 produced a fix that affected publishable behavior.
- [ ] 5.3 Run `/opsx:archive tsconfig-migrate-nodenext` once the change is merged.

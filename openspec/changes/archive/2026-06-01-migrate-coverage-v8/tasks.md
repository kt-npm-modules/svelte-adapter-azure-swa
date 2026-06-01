## 1. Update dev dependencies

- [x] 1.1 Remove `@vitest/coverage-istanbul` from `devDependencies` in [package.json](package.json) (via `npm uninstall @vitest/coverage-istanbul`)
- [x] 1.2 Add `@vitest/coverage-v8` to `devDependencies` in [package.json](package.json) at a range matching the resolved `vitest` version (via `npm install -D @vitest/coverage-v8@4.1.7`)
- [x] 1.3 Verify `package-lock.json` was refreshed by the install commands
- [x] 1.4 Verify `node_modules/@vitest/coverage-v8` exists and `node_modules/@vitest/coverage-istanbul` does not

## 2. Switch the Vitest provider

- [x] 2.1 In [vite.config.js](vite.config.js), change `test.coverage.provider` from `'istanbul'` to `'v8'`
- [x] 2.2 Confirm `test.coverage.reportsDirectory` remains `'./coverage-test'` and is unchanged
- [x] 2.3 Confirm `test.coverage.reporter` remains `['text', 'html', 'clover', 'json', 'lcov']` and is unchanged
- [x] 2.4 Confirm `test.coverage.exclude` retains every existing entry (configDefaults.exclude, `./tests/demo/**`, `./tests/new-demo/**`, `./tests/**`, `./src/server/entry/index.js`, `./tests/unit/json.js`) and that no entries are added or removed

## 3. Verify the new coverage run

- [x] 3.1 Run `npm run test` and confirm it exits 0 (covered by `npm run coverage`)
- [x] 3.2 Run `npm run coverage` and confirm it exits 0
- [x] 3.3 Verify `./coverage-test/lcov.info` exists and is non-empty
- [x] 3.4 Verify `./coverage-test/clover.xml` exists and is non-empty
- [x] 3.5 Verify `./coverage-test/coverage-final.json` exists and is non-empty
- [x] 3.6 Verify `./coverage-test/index.html` exists and is non-empty
- [x] 3.7 Spot-check `./coverage-test/lcov.info` for absence of any path under `./tests/` and absence of `./src/server/entry/index.js`

## 4. Lint, format, and changeset

- [x] 4.1 Run `npm run lint:all` and confirm it exits 0 (formatting fix applied to `openspec/changes/migrate-coverage-v8/design.md`)
- [x] 4.2 Run `npm run check:all` and confirm it exits 0
- [x] 4.3 Run `npm run test:swa --prefix tests/demo` end-to-end and confirm 29/29 pass
- [x] 4.4 Add a `patch` changeset describing "Switch Vitest coverage provider from Istanbul to V8" under `.changeset/`

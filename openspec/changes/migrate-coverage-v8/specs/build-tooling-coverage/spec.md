## ADDED Requirements

### Requirement: Vitest coverage provider is V8

The package's Vitest configuration in `vite.config.js` SHALL set `test.coverage.provider` to `"v8"`. The corresponding provider package `@vitest/coverage-v8` MUST be present in `devDependencies`, and the legacy `@vitest/coverage-istanbul` package MUST NOT be listed as a dependency or devDependency.

#### Scenario: Provider configured as v8

- **WHEN** `vite.config.js` is loaded
- **THEN** `test.coverage.provider` equals `"v8"`

#### Scenario: V8 provider package is installed

- **WHEN** the package's `devDependencies` are inspected
- **THEN** `@vitest/coverage-v8` is listed
- **AND** `@vitest/coverage-istanbul` is not listed in `dependencies` or `devDependencies`

### Requirement: Coverage provider package shares the Vitest major

The version range for `@vitest/coverage-v8` in `devDependencies` SHALL share the same major version as the `vitest` devDependency. Mismatched majors between `vitest` and its coverage provider package are not permitted.

#### Scenario: Coverage provider major matches Vitest

- **WHEN** the major version of the `vitest` devDependency range is `N`
- **THEN** the major version of the `@vitest/coverage-v8` devDependency range is also `N`

### Requirement: Coverage output directory is preserved

The `npm run coverage` script SHALL emit reports to `./coverage-test` at the repository root. `test.coverage.reportsDirectory` in `vite.config.js` MUST equal `"./coverage-test"`.

#### Scenario: Reports directory configured

- **WHEN** `vite.config.js` is loaded
- **THEN** `test.coverage.reportsDirectory` equals `"./coverage-test"`

#### Scenario: Reports written to expected directory

- **WHEN** `npm run coverage` is executed at the repository root
- **THEN** the directory `./coverage-test` exists after the run
- **AND** it contains generated coverage artifacts

### Requirement: Coverage report set is preserved

`test.coverage.reporter` in `vite.config.js` SHALL list exactly `text`, `html`, `clover`, `json`, and `lcov` (order is not significant, but the set MUST match). Each of these reporters MUST produce output under `./coverage-test` when `npm run coverage` is executed.

#### Scenario: Reporter list configured

- **WHEN** `vite.config.js` is loaded
- **THEN** `test.coverage.reporter` contains exactly the entries `"text"`, `"html"`, `"clover"`, `"json"`, and `"lcov"`

#### Scenario: All configured reports are produced

- **WHEN** `npm run coverage` is executed at the repository root
- **THEN** `./coverage-test/lcov.info` exists and is non-empty
- **AND** `./coverage-test/clover.xml` exists and is non-empty
- **AND** `./coverage-test/coverage-final.json` exists and is non-empty
- **AND** `./coverage-test/index.html` exists and is non-empty

### Requirement: Coverage exclude list is preserved during the provider migration

The `test.coverage.exclude` array in `vite.config.js` SHALL continue to include the same patterns the package excluded under the Istanbul provider: `configDefaults.exclude`, `./tests/demo/**`, `./tests/new-demo/**`, `./tests/**`, `./src/server/entry/index.js`, and `./tests/unit/json.js`. The provider migration MUST NOT add to or remove from this list.

#### Scenario: Exclude patterns unchanged

- **WHEN** `vite.config.js` is loaded
- **THEN** `test.coverage.exclude` includes every pattern from `configDefaults.exclude`
- **AND** it includes `"./tests/demo/**"`, `"./tests/new-demo/**"`, `"./tests/**"`, `"./src/server/entry/index.js"`, and `"./tests/unit/json.js"`

#### Scenario: Excluded files do not appear in reports

- **WHEN** `npm run coverage` is executed at the repository root
- **THEN** no file under `./tests/` appears in `./coverage-test/lcov.info`
- **AND** `./src/server/entry/index.js` does not appear in `./coverage-test/lcov.info`

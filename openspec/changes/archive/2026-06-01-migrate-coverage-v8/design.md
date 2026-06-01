## Context

The package uses Vitest 4.x for unit testing under [vite.config.js](vite.config.js). Coverage is currently produced by the Istanbul provider through `@vitest/coverage-istanbul`, which instruments the source under `src/` before execution and emits reports to `./coverage-test/` in `text`, `html`, `clover`, `json`, and `lcov` formats.

The source under `src/` is hand-authored ESM JavaScript (no compile step) annotated with JSDoc. There is no transpilation between authored sources and the files Vitest executes, which is the case where the V8 provider — driven by the Node runtime's built-in coverage data — is most accurate and least invasive. The Istanbul provider was a reasonable default historically but is no longer the recommended Vitest default.

Stakeholders: this package's maintainers (test runtime + report shape), and any CI consumer that reads `./coverage-test/lcov.info` or similar artifacts. No published API consumer is affected.

## Goals / Non-Goals

**Goals:**

- Replace the Istanbul coverage provider with V8 in `vite.config.js`.
- Keep the script surface unchanged: `npm run test` and `npm run coverage` continue to work with the same flags.
- Keep the coverage output directory (`./coverage-test`) and reporter list (`text`, `html`, `clover`, `json`, `lcov`) unchanged so any downstream tooling continues to find the same artifacts.
- Keep the `exclude` patterns unchanged so the set of files counted toward coverage does not silently shift.
- Replace the `@vitest/coverage-istanbul` dev dependency with `@vitest/coverage-v8` at a version compatible with the installed Vitest major.

**Non-Goals:**

- Tightening or expanding the `exclude` list.
- Adding coverage thresholds (none exist today; this change does not introduce them).
- Changing the test runner, test framework, or any test files.
- Touching the `tests/demo/` or `tests/new-demo/` workspaces — they do not run coverage themselves.
- Wiring coverage into CI gates.

## Decisions

### Decision 1: Switch provider to `v8`

Set `test.coverage.provider` in [vite.config.js](vite.config.js) to `'v8'` and replace the `@vitest/coverage-istanbul` devDependency with `@vitest/coverage-v8`.

**Why:** Source under `src/` is plain ESM JavaScript, executed unmodified by Node. V8's runtime coverage data is accurate against this shape and avoids Istanbul's pre-execution instrumentation pass, which is the dominant cost of the current setup. V8 is also the Vitest-recommended default.

**Alternatives considered:**

- _Keep Istanbul._ Rejected — it adds an instrumentation step with no offsetting benefit for unbundled ESM.
- _Run both providers in parallel._ Rejected — doubles the dev-dependency surface and report directory complexity for no measurable upside.

### Decision 2: Preserve the existing reporter list and output directory

Keep `reportsDirectory: './coverage-test'` and `reporter: ['text', 'html', 'clover', 'json', 'lcov']` exactly as they are.

**Why:** Any downstream consumer (local inspection, CI, badges) is keyed off these paths. Migrating the provider should be a drop-in change; renaming or trimming reports would be a separate decision deserving its own change.

### Decision 3: Keep `exclude` byte-for-byte

The `exclude` list under `coverage` continues to include `configDefaults.exclude`, `./tests/demo/**`, `./tests/new-demo/**`, `./tests/**`, `./src/server/entry/index.js`, and `./tests/unit/json.js`.

**Why:** Provider migration must not silently change which files count toward coverage. Both providers honor `exclude` the same way for our patterns, so no translation is needed. If a future change wants to revisit excludes, it should be a separate proposal so the diff is reviewable.

### Decision 4: Pin `@vitest/coverage-v8` to the installed Vitest major

The dev-dependency range for `@vitest/coverage-v8` SHALL match the installed Vitest major (currently `^4.x`). The Vitest documentation requires the coverage provider package to share the same major as `vitest`.

**Why:** Mismatched majors between `vitest` and a coverage provider cause runtime errors and confusing failures. Pinning to the same major, the same way `@vitest/browser` is already pinned in this package, eliminates that class of failure.

## Risks / Trade-offs

- **Risk:** V8 and Istanbul can disagree on per-line/branch counts because they measure coverage differently (V8 uses range-based runtime data, Istanbul uses instrumented counters). → _Mitigation:_ No coverage thresholds exist today, so the absolute numbers are not a build gate. Reviewers should expect small numeric shifts and treat them as expected.
- **Risk:** Some downstream tool only consumes Istanbul-shaped JSON. → _Mitigation:_ The `json` and `lcov` reporters in `@vitest/coverage-v8` emit the same standard formats consumed by the same tools (NYC summary JSON / standard `lcov.info`). No downstream tool consumed Istanbul-internal JSON in this repository.
- **Risk:** `@vitest/coverage-v8` major mismatched with `vitest`. → _Mitigation:_ Decision 4 — pin the range to the installed Vitest major and verify with a clean install before merging.
- **Trade-off:** V8 reports for source with sourcemaps can show fewer "phantom" branches than Istanbul, which means the coverage percentage may move slightly. This is expected and acceptable; preserving the exclude list bounds the change to "same files, different measurement strategy".

## Migration Plan

1. Update `vite.config.js` to set `provider: 'v8'`.
2. In `package.json` devDependencies, remove `@vitest/coverage-istanbul` and add `@vitest/coverage-v8` at `^4.1.2` (matching the current `vitest` range).
3. Run `npm install` to refresh `package-lock.json`.
4. Run `npm run coverage` and verify `./coverage-test/lcov.info`, `./coverage-test/clover.xml`, `./coverage-test/coverage-final.json`, and `./coverage-test/index.html` exist and are non-empty.
5. Confirm the same set of files appears in the report (no new entries from `tests/**` or `src/server/entry/index.js`).

**Rollback:** Revert the commit. The change is confined to `vite.config.js`, `package.json`, and `package-lock.json`; no source or test code changes, so revert is mechanical.

## Open Questions

None. The decisions above fully constrain the change.

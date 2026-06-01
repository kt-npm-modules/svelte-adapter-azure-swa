## Why

The package currently runs Vitest coverage through the Istanbul provider, which requires an extra instrumentation pass and a separate `@vitest/coverage-istanbul` dev dependency. V8 coverage is built on the runtime's native coverage data, runs faster against the hand-authored ESM under `src/`, and is the provider that Vitest itself recommends as the default. Standardizing on V8 removes an instrumentation step, drops one dev dependency, and aligns the package with the rest of the kt-npm-modules ecosystem.

## What Changes

- Switch the Vitest coverage provider in `vite.config.js` from `istanbul` to `v8`.
- Replace the `@vitest/coverage-istanbul` dev dependency with `@vitest/coverage-v8` (pinned to the same major as the installed `vitest`).
- Keep all existing coverage knobs (`reportsDirectory`, `exclude`, `reporter` list) unchanged so `npm run coverage` produces the same set of reports at the same path.
- Refresh the lockfile and verify `npm run coverage` produces non-empty `text`, `html`, `clover`, `json`, and `lcov` outputs under `./coverage-test`.

## Capabilities

### New Capabilities

- `build-tooling-coverage`: Defines the Vitest coverage provider, its dependency, and the report shape that `npm run coverage` produces for the root package.

### Modified Capabilities

<!-- none -->

## Impact

- Affected files: [vite.config.js](vite.config.js), [package.json](package.json), [package-lock.json](package-lock.json).
- Dev dependency change: remove `@vitest/coverage-istanbul`, add `@vitest/coverage-v8`.
- Affected scripts: `npm run coverage` (output directory and report set unchanged; provider underneath changes).
- No runtime, published-API, or consumer-facing impact — the change is confined to test tooling.
- CI: any pipeline that consumes `./coverage-test/lcov.info` or other reports continues to work because filenames and the reporter list are preserved.

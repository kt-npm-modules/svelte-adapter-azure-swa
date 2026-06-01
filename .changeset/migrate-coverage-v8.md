---
'@ktarmyshov/svelte-adapter-azure-swa': patch
---

Switch Vitest coverage provider from Istanbul to V8. Replaces the `@vitest/coverage-istanbul` devDependency with `@vitest/coverage-v8`. The `./coverage-test` output directory and the `text` / `html` / `clover` / `json` / `lcov` reporter set are unchanged, so any downstream tooling continues to find the same artifacts.

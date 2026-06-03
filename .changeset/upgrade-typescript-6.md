---
'@ktarmyshov/svelte-adapter-azure-swa': patch
---

Support TypeScript 6, ship `CHANGELOG.md` in the published tarball, tighten type-check scripts.

- **TypeScript 6.0.3.** `devDependencies.typescript` bumped from `^5.9.3` to `^6.0.3`. Type-check now passes cleanly under the new compiler. Six TS6-surfaced JSDoc/control-flow issues in `src/emulator/index.js`, `src/server/entry/entry.js`, `src/swa-config/index.js`, and `src/utils.js` are fixed at the source — no diagnostic-suppression comments were added.
- **Ship `CHANGELOG.md` in the tarball.** `package.json` `files` is now `["src", "CHANGELOG.md"]` (npm does not auto-include `CHANGELOG.md` the way it does `README` and `LICENSE`).
- **`check` script tightened.** `scripts.check` now runs `tsc --project tsconfig.json --noEmit`. The redundant CLI `--skipLibCheck` flag was dropped; `skipLibCheck: true` is now sourced from `tsconfig.json` directly.

No public API changes. No engines change.

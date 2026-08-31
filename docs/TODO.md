# TODO

## Pending: azure-functions-core-tools broken release

`azure-functions-core-tools@4.13.0+` has `chalk@6.0.0` hardcoded in its shrinkwrap pointing to an authenticated Azure DevOps Artifacts feed (`pkgs.dev.azure.com/azfunc/public/...`), which fails in CI without TFS-Federated credentials.

**Tracking:** https://github.com/Azure/azure-functions-core-tools/pull/5571

**Current workaround** (`.github/workflows/ci-swa.yml`):

- Pinned install to `azure-functions-core-tools@4.12.1` — last working version
- `--verbose` left intentionally to diagnose when it eventually passes

**When fixed:** unpin version (`azure-functions-core-tools` → no version), remove `--verbose`

---

## Pending: Add Node 24 support

Azure SWA platform currently supports Node 20 and Node 22. When Node 24 support is added upstream:

- Add `node:24` to `src/types/swa.d.ts` runtime union
- Regenerate `src/types/swa-config-gen.d.ts` via `npm run gen:swa-config-ts`
- Update `engines` in `package.json` and `tests/demo/package.json`
- Update CI matrix in `.github/workflows/ci.yml` (lines 21 and 221)
- Update `README.md`

---

## Pending: PR #243 — no changeset

PR #243 (contributor: SukeshP1995, "chore: set platform while configuring rolldown") has no changeset file. Needs either a patch changeset or explicit `[skip ci]`/empty changeset decision before merging.

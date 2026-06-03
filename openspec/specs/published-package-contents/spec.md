# published-package-contents Specification

## Purpose

Defines what the npm tarball produced by this repository (via `npm pack` / `npm publish`) MUST contain and MUST NOT contain. Establishes the explicit set of paths that ship to consumers, ensures release metadata (`CHANGELOG.md`) is present, and prevents repository-only scaffolding (test workspaces, OpenSpec artifacts, CI configs, internal scripts) from leaking into published packages.

## Requirements

### Requirement: Tarball includes `CHANGELOG.md`

The npm package tarball produced by `npm pack` (and consequently `npm publish`) SHALL include `CHANGELOG.md` at the package root. `CHANGELOG.md` is not auto-included by npm the way `README` and `LICENSE` are; it MUST therefore be listed explicitly in `package.json` `files` (or its containing path MUST be listed).

#### Scenario: npm pack lists CHANGELOG.md

- **WHEN** `npm pack --dry-run --ignore-scripts` runs at the repository root after a successful release
- **THEN** the printed tarball contents include a line for `CHANGELOG.md`

#### Scenario: Installed package retains CHANGELOG.md

- **WHEN** a consumer runs `npm install @ktarmyshov/svelte-adapter-azure-swa@latest` into a fresh project
- **THEN** `node_modules/@ktarmyshov/svelte-adapter-azure-swa/CHANGELOG.md` exists on disk

### Requirement: Tarball does not include unrelated repository scaffolding

The published tarball SHALL contain only the runtime adapter source under `src/`, the package metadata (`package.json`), the human-facing docs auto-included by npm (`README.md`, `LICENSE`), and the changelog (`CHANGELOG.md`). It SHALL NOT include test workspaces, OpenSpec artifacts, GitHub workflows, scripts, or repository-only configs.

#### Scenario: Test workspaces are excluded

- **WHEN** `npm pack --dry-run --ignore-scripts` runs at the repository root
- **THEN** no path under `tests/` is listed
- **AND** no path under `openspec/` is listed
- **AND** no path under `.github/` or `.changeset/` is listed
- **AND** no path under `scripts/` is listed

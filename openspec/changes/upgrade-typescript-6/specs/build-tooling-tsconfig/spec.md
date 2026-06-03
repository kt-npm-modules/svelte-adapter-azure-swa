## MODIFIED Requirements

### Requirement: Root tsconfig uses nodenext module mode

The package's root `tsconfig.json` (at the repository root, used by `npm run check`) SHALL set `compilerOptions.module` to `"nodenext"` and `compilerOptions.moduleResolution` to `"nodenext"`. These two options MUST be kept in sync; mixing `nodenext` with any other module/resolution mode is not permitted.

#### Scenario: Config values are nodenext

- **WHEN** the root `tsconfig.json` is loaded
- **THEN** `compilerOptions.module` equals `"nodenext"`
- **AND** `compilerOptions.moduleResolution` equals `"nodenext"`

#### Scenario: Type-check passes under nodenext

- **WHEN** `npm run check` is executed at the repository root
- **THEN** `tsc --project tsconfig.json --noEmit` exits with code 0 against the source under `src/`

## ADDED Requirements

### Requirement: Package targets TypeScript 6 in devDependencies

The package's `devDependencies.typescript` SHALL be `^6.0.3` (or any newer compatible 6.x). The package's source MUST type-check cleanly under that version with `checkJs` enabled. Earlier major versions (≤ 5.x) are not supported as the dev toolchain.

#### Scenario: devDependencies.typescript is on the 6.x line

- **WHEN** `package.json` is read
- **THEN** `devDependencies.typescript` is a SemVer range that includes `^6.0.3` and excludes 5.x

#### Scenario: Type-check passes under TypeScript 6

- **WHEN** `npm run check` is executed at the repository root after `npm install` resolves `typescript@^6.0.3`
- **THEN** the command exits with code 0
- **AND** no `error TS` diagnostic is emitted from any file under `src/`

### Requirement: Type-check scripts use explicit project files and inherit `--skipLibCheck` from config

The `scripts.check` entry SHALL invoke `tsc --project tsconfig.json --noEmit`. The `scripts.check:test` entry SHALL invoke `tsc --project tsconfig-test.json` (or the canonical test-project file if introduced later). Neither script SHALL pass `--skipLibCheck` on the command line; the option MUST be sourced from the relevant `tsconfig*.json`.

#### Scenario: scripts.check is project-pinned and noEmit-pinned

- **WHEN** `package.json` is read
- **THEN** `scripts.check` equals `"tsc --project tsconfig.json --noEmit"`

#### Scenario: scripts pass no redundant compiler flags

- **WHEN** `package.json` is read
- **THEN** neither `scripts.check` nor `scripts.check:test` includes `--skipLibCheck` as a CLI argument

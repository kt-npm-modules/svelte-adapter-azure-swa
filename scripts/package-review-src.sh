#!/usr/bin/env bash
set -euo pipefail

# Packages project source for ChatGPT code review.
#
# Honors all (nested) .gitignore files via `git ls-files`, so anything that
# git would ignore stays out of the archive. Must be run inside a git repo.
#
# Usage:
#   ./scripts/package-review-src.sh
#   ./scripts/package-review-src.sh my-prefix
#
# Output:
#   ./artifacts/<name>-YYYYMMDD-HHMMSS.tgz

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACTS_DIR="$ROOT_DIR/artifacts"
STAGING_DIR="$ARTIFACTS_DIR/.review-src-staging"

TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
NAME_PREFIX="${1:-adapter-src-review}"

ARCHIVE_NAME="${NAME_PREFIX}-${TIMESTAMP}.tgz"
ARCHIVE_PATH="$ARTIFACTS_DIR/$ARCHIVE_NAME"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$ARTIFACTS_DIR"

# Copies a file or directory into staging, honoring all nested .gitignore
# rules via `git ls-files`. Missing paths are silently skipped — the script
# is intended to be reusable across repos that may not share the same layout.
copy_if_exists() {
  local path="$1"
  [[ -e "$ROOT_DIR/$path" ]] || return 0

  if [[ -d "$ROOT_DIR/$path" ]]; then
    while IFS= read -r -d '' f; do
      mkdir -p "$STAGING_DIR/$(dirname "$f")"
      cp "$ROOT_DIR/$f" "$STAGING_DIR/$f"
    done < <(git -C "$ROOT_DIR" ls-files -z --cached --others --exclude-standard -- "$path")
  else
    # Single file: skip if git considers it ignored.
    if git -C "$ROOT_DIR" check-ignore -q "$path"; then
      return 0
    fi
    mkdir -p "$STAGING_DIR/$(dirname "$path")"
    cp "$ROOT_DIR/$path" "$STAGING_DIR/$path"
  fi
}

echo "Preparing review package..."

copy_if_exists "src"
copy_if_exists "tests"
copy_if_exists ".github"

copy_if_exists "tsconfig.json"
copy_if_exists "tsconfig-test.json"
copy_if_exists "tsconfig-release.json"

copy_if_exists "vite.config.ts"
copy_if_exists "vitest.config.ts"

copy_if_exists "README.md"
copy_if_exists "package.json"
copy_if_exists "LICENSE"
copy_if_exists "CHANGELOG.md"

copy_if_exists ".changeset"

# Strip macOS noise.
find "$STAGING_DIR" \( \
  -name '.DS_Store' -o \
  -name '._*' -o \
  -name 'Icon?' -o \
  -name '.apdisk' \
\) -type f -delete
find "$STAGING_DIR" -type d \( \
  -name '.AppleDouble' -o \
  -name '.Spotlight-V100' -o \
  -name '.Trashes' -o \
  -name '.fseventsd' -o \
  -name '.TemporaryItems' -o \
  -name '__MACOSX' \
\) -prune -exec rm -rf {} +

{
  echo "Included project tree:"
  echo
  if command -v tree >/dev/null 2>&1; then
    tree "$STAGING_DIR"
  else
    (
      cd "$STAGING_DIR"
      find . | sort
    )
  fi
} > "$STAGING_DIR/TREE.txt"

(
  cd "$STAGING_DIR"
  tar -czf "$ARCHIVE_PATH" .
)

rm -rf "$STAGING_DIR"

echo
echo "Archive created:"
echo "  $ARCHIVE_PATH"

open "$ARTIFACTS_DIR"

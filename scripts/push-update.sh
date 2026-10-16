#!/bin/bash
set -euo pipefail

cd "$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"

# First parameter is optional commit message, defaults to "update"
COMMIT_MESSAGE=${1:-"update"}

npm run format:all

# Push the changes to the remote repository
git add .
git commit -m "$COMMIT_MESSAGE" --allow-empty
git push

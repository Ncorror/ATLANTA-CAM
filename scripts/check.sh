#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd -- "$repo_root"

git diff --check --
git diff --cached --check --

while IFS= read -r -d '' script; do
  if [[ -f "$script" ]]; then
    bash -n -- "$script"
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- '*.sh')

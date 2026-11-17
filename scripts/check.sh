#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd -- "$repo_root"

if [[ ${1:-} == --staged ]]; then
  git diff --cached --check --
  while IFS= read -r -d '' script; do
    git show ":$script" | bash -n
  done < <(git diff --cached --name-only --diff-filter=ACMR -z -- '*.sh')
  exit 0
fi

git diff --check --
git diff --cached --check --

while IFS= read -r -d '' script; do
  if [[ -f "$script" ]]; then
    bash -n -- "$script"
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- '*.sh')

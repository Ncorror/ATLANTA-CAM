#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  printf 'Использование: bash scripts/push.sh "Сообщение коммита"\n' >&2
  exit 2
fi

repo_root=$(git rev-parse --show-toplevel)
cd -- "$repo_root"

branch=$(git symbolic-ref --quiet --short HEAD) || {
  printf 'Переключись на ветку перед отправкой.\n' >&2
  exit 2
}
git remote get-url origin >/dev/null

git add -A
bash scripts/check.sh
if ! git diff --cached --quiet --; then
  git commit -m "$1"
fi
git push --set-upstream origin "HEAD:refs/heads/$branch"

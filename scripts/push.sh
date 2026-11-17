#!/usr/bin/env bash
set -euo pipefail

stage_all=false
if [[ ${1:-} == --all ]]; then
  stage_all=true
  shift
fi

if [[ $# -ne 1 || -z "$1" ]]; then
  printf 'Использование: bash scripts/push.sh [--all] "Сообщение коммита"\n' >&2
  exit 2
fi

repo_root=$(git rev-parse --show-toplevel)
cd -- "$repo_root"

branch=$(git symbolic-ref --quiet --short HEAD) || {
  printf 'Переключись на ветку перед отправкой.\n' >&2
  exit 2
}
git remote get-url origin >/dev/null

if [[ "$stage_all" == true ]]; then
  git add -A
fi
bash scripts/check.sh --staged
if ! git diff --cached --quiet --; then
  git commit -m "$1"
else
  printf 'Индекс пуст. Отправляю существующие коммиты.\n'
fi
git push --set-upstream origin "HEAD:refs/heads/$branch"

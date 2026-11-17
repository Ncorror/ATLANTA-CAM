#!/usr/bin/env bash
set -euo pipefail

commit=$(git rev-parse HEAD)
branch=$(git symbolic-ref --quiet --short HEAD) || {
  printf 'Переключись на ветку, которую проверяет CI.\n' >&2
  exit 2
}

for attempt in {1..12}; do
  run_id=$(gh run list --workflow ci.yml --event push --branch "$branch" --commit "$commit" \
    --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  if [[ -n "$run_id" ]]; then
    break
  fi
  if (( attempt < 12 )); then
    sleep 5
  fi
done

if [[ -z "$run_id" ]]; then
  printf 'CI для %s в ветке %s пока отсутствует. Проверь push и повтори команду.\n' "$commit" "$branch" >&2
  exit 2
fi

gh run watch "$run_id" --exit-status --interval 10 >/dev/null || true
summary=$(gh run view "$run_id" --json status,conclusion,url \
  --jq '[(.conclusion | select(length > 0)) // .status, .url] | @tsv')
IFS=$'\t' read -r result url <<< "$summary"
printf 'CI %s %s\n' "$result" "$url"

case "$result" in
  success) exit 0 ;;
  failure | timed_out | startup_failure) gh run view "$run_id" --log-failed ;;
esac
exit 1

#!/usr/bin/env bash
set -euo pipefail

commit=$(git rev-parse HEAD)
branch=$(git symbolic-ref --quiet --short HEAD) || {
  printf 'Переключись на ветку, которую проверяет CI.\n' >&2
  exit 2
}

query_github() {
  local attempt output status
  for attempt in {1..3}; do
    if output=$(gh "$@"); then
      printf '%s\n' "$output"
      return 0
    else
      status=$?
    fi
    if (( status == 2 || status == 4 )); then
      return "$status"
    fi
    if (( attempt < 3 )); then
      sleep 5
    fi
  done
  printf 'GitHub не ответил на запрос CI. Запусти scripts/ci.sh ещё раз.\n' >&2
  return 2
}

for attempt in {1..12}; do
  run_id=$(query_github run list --workflow ci.yml --event push --branch "$branch" --commit "$commit" \
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

while :; do
  summary=$(query_github run view "$run_id" --json status,conclusion,url \
    --jq '[.status, (.conclusion | select(length > 0)) // "unknown", .url] | @tsv')
  IFS=$'\t' read -r status result url <<< "$summary"
  if [[ "$status" == completed ]]; then
    break
  fi
  sleep 10
done
printf 'CI %s %s\n' "$result" "$url"

case "$result" in
  success) exit 0 ;;
  failure | timed_out | startup_failure) gh run view "$run_id" --log-failed || true ;;
esac
exit 1

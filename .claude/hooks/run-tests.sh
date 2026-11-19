#!/bin/bash
# Stop hook: run the app and pipeline tests before an agent ends its turn.
#
# It runs only when code changed and is not pushed yet: an uncommitted change,
# or a commit that is not on the branch's upstream (origin/main when the branch
# has none), under app/, pipeline/, tests/, or scripts/. A content run changes
# only data files, so the hook does not run in a content run.
#
# When a suite fails, the hook blocks the stop once and gives the failure to the
# agent. When it already blocked in this turn (stop_hook_active), it lets the
# turn end, so an agent cannot loop on it.
#
# The design is in docs/superpowers/specs/2026-11-17-verification-and-review.md,
# section 4.2. The owner ruled to enforce from the start (D2).

input=$(cat)
if [ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(jq -r '.cwd // "."' <<<"$input")}" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

paths=(app pipeline tests scripts)
base=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo origin/main)

changed=$(
  {
    git status --porcelain -- "${paths[@]}"
    git diff --name-only "$base"...HEAD -- "${paths[@]}" 2>/dev/null
  } | head -n 1
)
[ -z "$changed" ] && exit 0

log=$(mktemp)
trap 'rm -f "$log"' EXIT
failed=()
failed_logs=()
if ! npm test --silent >"$log.app" 2>&1; then
  failed+=("npm test"); failed_logs+=("$log.app")
fi
if ! npm run test:pipeline --silent >"$log.pipeline" 2>&1; then
  failed+=("npm run test:pipeline"); failed_logs+=("$log.pipeline")
fi

if [ ${#failed[@]} -eq 0 ]; then
  rm -f "$log.app" "$log.pipeline"
  exit 0
fi

{
  echo "The Stop hook ran the tests because code under app/, pipeline/, tests/, or scripts/ changed. These failed: ${failed[*]}."
  echo "Fix the cause before you end the turn. Do not skip a test or change an assertion to make it pass."
  if grep -q "Cannot find package 'sharp'" "$log.pipeline" 2>/dev/null; then
    echo "The pipeline tests cannot load sharp: run npm ci first."
  fi
  for f in "${failed_logs[@]}"; do
    echo
    echo "--- $( [ "$f" = "$log.app" ] && echo 'npm test' || echo 'npm run test:pipeline' ) ---"
    # A file that does not load prints its error just above its ✖ line, before
    # the "ℹ tests" totals. A failed assertion prints its error in the summary,
    # from "✖ failing tests:" to the end. Give both, and no passing test.
    sed '/^ℹ tests /q' "$f" | grep -v '^✔' | grep -B 10 '^ *✖ ' | head -n 60
    sed -n '/^✖ failing tests:/,$p' "$f" | head -n 60
  done
} >"$log"
rm -f "$log.app" "$log.pipeline"

jq -n --rawfile reason "$log" '{decision: "block", reason: $reason}'
exit 0

#!/bin/bash
# Stop hook: run the app and pipeline tests before an agent ends its turn.
#
# It runs only when code changed and is not pushed yet: an uncommitted change,
# or a commit that is not on the branch's upstream (origin/main when the branch
# has none), under app/, pipeline/, tests/, or scripts/. pipeline/runs/ is left
# out: a content run's CLI writes and commits its data there, so a content run
# does not start the hook. When the base ref is missing, the hook runs the tests.
#
# When a suite fails, the hook blocks the stop once and gives the failure to the
# agent. When it already blocked in this turn (stop_hook_active), it lets the
# turn end, so an agent cannot loop on it.
#
# It reads and writes JSON with node, which the repo needs anyway, not jq.
#
# The design is in docs/superpowers/specs/2026-11-17-verification-and-review.md,
# section 4.2. The owner ruled to enforce from the start (D2).

input=$(cat)
field() {
  node -e 'let d={};try{d=JSON.parse(process.argv[1])}catch{};const v=d[process.argv[2]];process.stdout.write(v==null?"":String(v))' "$input" "$1"
}

[ "$(field stop_hook_active)" = "true" ] && exit 0

dir="${CLAUDE_PROJECT_DIR:-$(field cwd)}"
cd "${dir:-.}" || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

paths=(app pipeline tests scripts ':(exclude)pipeline/runs')
base=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo origin/main)

if git rev-parse --verify -q "$base" >/dev/null; then
  changed=$(
    {
      git status --porcelain -- "${paths[@]}"
      git diff --name-only "$base"...HEAD -- "${paths[@]}"
    } | head -n 1
  )
  [ -z "$changed" ] && exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

failed=()
failed_logs=()
if ! npm test --silent >"$tmp/app" 2>&1; then
  failed+=("npm test"); failed_logs+=("$tmp/app")
fi
if ! npm run test:pipeline --silent >"$tmp/pipeline" 2>&1; then
  failed+=("npm run test:pipeline"); failed_logs+=("$tmp/pipeline")
fi
[ ${#failed[@]} -eq 0 ] && exit 0

{
  echo "The Stop hook ran the tests because code under app/, pipeline/, tests/, or scripts/ changed and is not pushed. These failed: ${failed[*]}."
  echo "Fix the cause before you end the turn. Do not skip a test or change an assertion to make it pass."
  if grep -q "Cannot find package 'sharp'" "$tmp/pipeline" 2>/dev/null; then
    echo "The pipeline tests cannot load sharp: run npm ci first."
  fi
  for f in "${failed_logs[@]}"; do
    echo
    echo "--- $( [ "$f" = "$tmp/app" ] && echo 'npm test' || echo 'npm run test:pipeline' ) ---"
    # A file that does not load prints its error just above its ✖ line, before
    # the "ℹ tests" totals. A failed assertion prints its error in the summary,
    # from "✖ failing tests:" to the end. Give both, and no passing test.
    sed '/^ℹ tests /q' "$f" | grep -v '^✔' | grep -B 10 '^ *✖ ' | head -n 60
    sed -n '/^✖ failing tests:/,$p' "$f" | head -n 60
  done
} >"$tmp/reason"

node -e 'const fs=require("fs");process.stdout.write(JSON.stringify({decision:"block",reason:fs.readFileSync(process.argv[1],"utf8")}))' "$tmp/reason"
exit 0

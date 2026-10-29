#!/usr/bin/env bash
# cleanup.sh <run-directory> [--worktree <path>]
# Stops what a verification run left behind and keeps the evidence: Chromium processes that were started on the run
# directory, half-written `<out>.partial` builds under it, and (with --worktree) the detached review worktree. The run directory
# itself, REPORT.md and every artifact stay. Safe to run twice.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: cleanup.sh <run-directory> [--worktree <path>]" >&2; exit 64; }
run=$(realpath "$1"); shift
[ -d "$run" ] || { echo "no such run directory: $run" >&2; exit 66; }
worktree=""
[ "${1:-}" != --worktree ] || worktree=$2

pids=$(pgrep -f "chrom.*$run" || true)
if [ -n "$pids" ]; then
  echo "stopping Chromium started on $run: $pids"
  # shellcheck disable=SC2086
  kill $pids
else
  echo "no Chromium left on $run"
fi

while IFS= read -r partial; do
  echo "removing half-written build $partial"
  rm -rf -- "$partial"
done < <(find "$run" -maxdepth 3 -name '*.partial' -type d)

if [ -n "$worktree" ]; then
  if [ -z "$(git -C "$worktree" status --porcelain)" ]; then
    /run/current-system/sw/bin/git worktree remove "$worktree"
    echo "removed worktree $worktree"
  else
    echo "worktree $worktree is not clean: left in place" >&2
  fi
fi

echo "evidence kept in $run:"
du -sh "$run" | cut -f1
find "$run" -maxdepth 1 | sort

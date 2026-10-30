#!/usr/bin/env bash
# cleanup.sh <run-directory> [--worktree <path>]
# Stops what a verification run left behind and keeps the evidence. It stops only the process groups recorded in
# `<run>/pids.txt` ("<pid> <start time>" per line): run.sh records each step (its own session and group), and observe.ts records
# the Chromium it launches, which Playwright starts detached in a group of its own. A Chromium launched by `tsukuri build` or
# `journey` is not recorded and is not stopped here. A live pid whose start time differs from the record is a reused pid and
# is left alone. It never searches for processes by name or pattern. It also removes half-written `<out>.partial` builds under
# the run directory and, with --worktree, the detached review worktree when it is clean. The run directory, REPORT.md and every
# artifact stay. Safe to run twice.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: cleanup.sh <run-directory> [--worktree <path>]" >&2; exit 64; }
run=$(realpath "$1"); shift
[ -d "$run" ] || { echo "no such run directory: $run" >&2; exit 66; }
worktree=""
[ "${1:-}" != --worktree ] || worktree=$2

stopped=0
if [ -f "$run/pids.txt" ]; then
  while read -r pid begun; do
    [ -n "$pid" ] || continue
    now=$(awk '{ print $22 }' "/proc/$pid/stat" 2>/dev/null || true)
    # The step's leader still runs with its recorded start time, or it has exited and only members of its group remain
    # (the kernel does not reuse a pid while it names a live process group, so such a group is ours). A live process with
    # another start time is a reused pid: not ours, left alone.
    if [ -z "$now" ] || [ "$now" = "$begun" ]; then
      if kill -TERM -- "-$pid" 2>/dev/null; then
        kill -CONT -- "-$pid" 2>/dev/null || true # a stopped (hung) group acts on the TERM only once it runs
        echo "stopped process group $pid recorded in pids.txt"
        stopped=$((stopped + 1))
      fi
    fi
  done <"$run/pids.txt"
fi
[ "$stopped" -gt 0 ] || echo "no recorded process group of $run is still running"

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

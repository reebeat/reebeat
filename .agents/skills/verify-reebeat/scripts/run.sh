#!/usr/bin/env bash
# run.sh <label> [--story <file>] [--journey] [--speech-flags "<flags>"] [--cache-dir <dir>]
# One verification run of the checkout you are in (REEBEAT_VERIFY_TREE overrides): headroom, plan, lint, build into a scratch
# directory, `reebeat check`, then the independent observations (frames, onsets, subtitles and chapters, Deck, speech cache);
# with --journey also `reebeat journey` (two builds compared, F6). Every step's command and raw output is a file in the run
# directory <root>/<date>-<label>/, and REPORT.md lists them with exit codes and SHA-256. Nothing is written to the checkout.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tree=${REEBEAT_VERIFY_TREE:-$(git rev-parse --show-toplevel)}
if [ -z "${REEBEAT_CHROMIUM:-}" ]; then
  # Re-enter devenv: the system Bun can hang, and Chromium, ffmpeg and whisper come from it.
  cd "$tree" && exec devenv shell -- "$here/run.sh" "$@"
fi

[ $# -ge 1 ] || { echo "usage: run.sh <label> [--story <file>] [--journey] [--speech-flags \"<flags>\"] [--cache-dir <dir>]" >&2; exit 64; }
label=$1; shift
story=stories/same-id/story.fountain; journey=0; flags=""; cache=""
while [ $# -gt 0 ]; do
  case $1 in
    --story) story=$2; shift 2 ;;
    --journey) journey=1; shift ;;
    --speech-flags) flags=$2; shift 2 ;;
    --cache-dir) cache=$2; shift 2 ;;
    *) echo "unknown argument $1" >&2; exit 64 ;;
  esac
done
[[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "label must be letters, digits, . _ -" >&2; exit 64; }

root=${REEBEAT_VERIFY_ROOT:-$HOME/.local/state/reebeat-verify}
run=$root/$(date +%F)-$label
[ ! -e "$run" ] || { echo "run directory exists: $run (pick another label; evidence is never overwritten)" >&2; exit 65; }
cd "$tree"
"$here/headroom.sh" | tee /dev/stderr >/tmp/reebeat-verify-headroom.$$ || { rm -f /tmp/reebeat-verify-headroom.$$; exit 1; }
mkdir -p "$run"
mv /tmp/reebeat-verify-headroom.$$ "$run/headroom.txt"

name=$(basename "$(dirname "$story")")
cache_flag=(); [ -z "$cache" ] || cache_flag=(--cache-dir "$cache")
# shellcheck disable=SC2206
speech=($flags)
build=$run/build/$name
steps=()

step() { # step <name> <command...>: writes <run>/<name>.txt, "$ command" first, then the raw output
  local n=$1; shift
  local started; started=$(date +%s)
  { echo "\$ $*"; "$@"; } >"$run/$n.txt" 2>&1 && code=0 || code=$?
  steps+=("$n|$code|$(( $(date +%s) - started ))|$*")
  echo "step $n: exit $code ($(( $(date +%s) - started )) s) -> $run/$n.txt"
}

{
  echo "label: $label"; echo "date: $(date -Is)"; echo "tree: $tree"
  echo "head: $(git rev-parse HEAD)"; echo "branch: $(git branch --show-current)"
  echo "base: $(git merge-base HEAD origin/main 2>/dev/null || echo unknown)"
  echo "status:"; git status --short
} >"$run/meta.txt"

reebeat=(bun packages/cli/bin/reebeat.ts)
step plan "${reebeat[@]}" plan "$story" --timing "${cache_flag[@]}" "${speech[@]}"
step lint "${reebeat[@]}" lint "$story" "${cache_flag[@]}" "${speech[@]}"
step build "${reebeat[@]}" build "$story" --out "$build" "${cache_flag[@]}" "${speech[@]}"
step check "${reebeat[@]}" check "$build" --source "$story" "${cache_flag[@]}" "${speech[@]}"
obs=(bun "$here/observe.ts")
cache_dir=${cache:-}
step obs-frames "${obs[@]}" frames "$build" "$run/frames" "$tree"
step obs-onsets "${obs[@]}" onsets "$build" "$run/obs" "$tree" ${cache_dir:+"$cache_dir"}
step obs-subtitles "${obs[@]}" subtitles "$build" "$run/obs" "$tree"
step obs-deck "${obs[@]}" deck "$build" "$run/deck" "$tree"
step obs-cache "${obs[@]}" cache "$build" "$run/obs" "$tree" ${cache_dir:+"$cache_dir"}
if [ "$journey" = 1 ]; then
  step journey "${reebeat[@]}" journey "$story" --out-root "$run/journey" "${cache_flag[@]}" "${speech[@]}"
fi

{
  echo "# Verification run $label"; echo
  sed 's/^/    /' "$run/meta.txt"; echo
  echo "## Steps"; echo
  echo "| step | exit | seconds | command |"; echo "| --- | --- | --- | --- |"
  failed=0
  for s in "${steps[@]}"; do
    IFS='|' read -r n c t cmd <<<"$s"
    echo "| $n | $c | $t | \`$cmd\` (output: $n.txt) |"
    [ "$c" = 0 ] || failed=1
  done
  echo; echo "## Artifacts"; echo
  echo "| file | bytes | sha256 |"; echo "| --- | --- | --- |"
  (cd "$run" && find . -type f ! -name REPORT.md | sort | while read -r f; do
    echo "| ${f#./} | $(stat -c %s "$f") | $(sha256sum "$f" | cut -c1-16) |"
  done)
  echo; echo "Features driven and what was seen: write them under this heading by hand, naming each feature id of features.md."
} >"$run/REPORT.md"

echo "run directory: $run"
[ "$failed" = 0 ] && echo "VERIFY OK" || { echo "VERIFY FAILED: read the step files above"; exit 1; }

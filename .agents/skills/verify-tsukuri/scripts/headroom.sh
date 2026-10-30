#!/usr/bin/env bash
# headroom.sh: read the machine before a heavy job (a build captures 1,664 frames in Chromium and runs ffmpeg).
# Launch only if all four hold (operator limits of 2026-10-29), else exit 1 and say which is short:
#   1. MemAvailable after the job's expected demand is at least 20% of total RAM;
#   2. swap-in (pswpin change in /proc/vmstat over a 10 to 30 s sample) is under 1,000 pages per second;
#   3. memory PSI `full` avg60 is under 10% (never gated on avg10);
#   4. the load average (1 minute) is under the number of CPU threads.
# A reading that is missing or not a number is SHORT, with the reason: a gate never passes on a sample it could not read.
# Knobs: TSUKURI_VERIFY_DEMAND_MIB (default 4096: an assumption, set it from a measured run), TSUKURI_VERIFY_FORCE=1 (print the
# shortage and continue), and for tests TSUKURI_VERIFY_PROC_ROOT (default /proc), TSUKURI_VERIFY_SAMPLE_SECONDS (10 to 30, default 10),
# TSUKURI_VERIFY_NPROC, TSUKURI_VERIFY_TEST_SAMPLE_SECONDS. I/O pressure is printed, never gated.
set -euo pipefail

proc=${TSUKURI_VERIFY_PROC_ROOT:-/proc}
sample=${TSUKURI_VERIFY_SAMPLE_SECONDS:-10}
root=${TSUKURI_VERIFY_ROOT:-$HOME/.local/state/tsukuri-verify}
mkdir -p "$root"
demand_mib=${TSUKURI_VERIFY_DEMAND_MIB:-4096}

short=()
number='^[0-9]+([.][0-9]+)?$'

# take <variable> <value> <what>: sets the variable to the value when it is a number; otherwise leaves it empty and records why.
# It runs in the current shell, never in a command substitution, so the record survives.
take() {
  if [[ "$2" =~ $number ]]; then printf -v "$1" '%s' "$2"; else printf -v "$1" ''; short+=("$3 is unreadable (got \"$2\")"); fi
}
psi() { awk -v k="$1" -v f="$2" '$1 == k { for (i = 2; i <= NF; i++) { split($i, a, "="); if (a[1] == f) print a[2] } }' "$proc/pressure/$3" 2>/dev/null || true; }
pswpin() { awk '$1 == "pswpin" { print $2 }' "$proc/vmstat" 2>/dev/null || true; }
meminfo() { awk -v k="$1:" '$1 == k { print $2 }' "$proc/meminfo" 2>/dev/null || true; }
firstfield() { cut -d' ' -f1 "$proc/loadavg" 2>/dev/null || true; }
freedisk() { df --output=avail -BM "$root" 2>/dev/null | tail -1 | tr -dc '0-9' || true; }

# The swap-in sample is a 10 to 30 s window (a shorter one is noise, a longer one stalls the job). Anything else is SHORT, not
# admitted. TSUKURI_VERIFY_TEST_SAMPLE_SECONDS is for the tests only: any positive number replaces the window.
if [ -n "${TSUKURI_VERIFY_TEST_SAMPLE_SECONDS:-}" ]; then
  if [[ "$TSUKURI_VERIFY_TEST_SAMPLE_SECONDS" =~ $number ]] && awk -v s="$TSUKURI_VERIFY_TEST_SAMPLE_SECONDS" 'BEGIN { exit !(s > 0) }'; then sample=$TSUKURI_VERIFY_TEST_SAMPLE_SECONDS; else short+=("the test sample window \"$TSUKURI_VERIFY_TEST_SAMPLE_SECONDS\" is not a positive number"); sample=""; fi
elif ! [[ "$sample" =~ ^[0-9]+$ ]] || [ "$sample" -lt 10 ] || [ "$sample" -gt 30 ]; then
  short+=("the swap-in sample window is \"$sample\" s, not a whole number from 10 to 30")
  sample=""
fi
if [ -n "$sample" ]; then b=$(pswpin); sleep "$sample"; a=$(pswpin); else b=""; a=""; fi
if [ -n "$sample" ]; then
  take before "$b" "swap-in sample (pswpin) before"
  take after "$a" "swap-in sample (pswpin) after"
else
  before=""; after=""
fi
take full60 "$(psi full avg60 memory)" "memory PSI full avg60"
take total_kib "$(meminfo MemTotal)" "MemTotal"
take avail_kib "$(meminfo MemAvailable)" "MemAvailable"
take load1 "$(firstfield)" "load average"
take disk_free_mib "$(freedisk)" "free disk at $root"
take cpus "${TSUKURI_VERIFY_NPROC:-$(nproc)}" "CPU thread count"
some10=$(psi some avg10 memory); io10=$(psi some avg10 io)

echo "headroom: memory PSI full avg60=${full60:-?}; load1=${load1:-?} on ${cpus:-?} CPU threads; (memory some avg10=${some10:-?}, io some avg10=${io10:-?}: printed, not gated)"

if [ -n "$before" ] && [ -n "$after" ] && [ -n "$sample" ]; then
  # A counter that goes backwards is a different machine state, not a negative rate: refuse it.
  if [ "${after%.*}" -lt "${before%.*}" ]; then
    short+=("swap-in counter went backwards ($before to $after)")
  else
    swapin_rate=$(awk -v d="$(( ${after%.*} - ${before%.*} ))" -v s="$sample" 'BEGIN { printf "%.0f", d / s }')
    echo "headroom: swap-in ${swapin_rate} pages/s over ${sample} s"
    if awk -v r="$swapin_rate" 'BEGIN { exit !(r >= 1000) }'; then short+=("swap-in is $swapin_rate pages/s, not under 1,000"); fi
  fi
fi
if [ -n "$total_kib" ] && [ -n "$avail_kib" ]; then
  left_mib=$(( ${avail_kib%.*} / 1024 - demand_mib )); need_mib=$(( ${total_kib%.*} / 1024 / 5 ))
  echo "headroom: MemAvailable=$((${avail_kib%.*} / 1024)) MiB, demand ${demand_mib} MiB, left $left_mib MiB, needed $need_mib MiB (20% of $((${total_kib%.*} / 1024)) MiB)"
  [ "$left_mib" -ge "$need_mib" ] || short+=("MemAvailable after the job would be $left_mib MiB, under 20% of RAM ($need_mib MiB)")
fi
if [ -n "$full60" ] && awk -v v="$full60" 'BEGIN { exit !(v >= 10) }'; then short+=("memory PSI full avg60 is $full60, not under 10"); fi
if [ -n "$load1" ] && [ -n "$cpus" ] && awk -v l="$load1" -v c="$cpus" 'BEGIN { exit !(l >= c) }'; then short+=("load1 $load1 is not under $cpus CPU threads"); fi
if [ -n "$disk_free_mib" ] && [ "${disk_free_mib%.*}" -lt 2048 ]; then short+=("less than 2 GiB free at $root"); fi

if [ "${#short[@]}" -gt 0 ]; then
  printf 'headroom SHORT: %s\n' "${short[@]}"
  if [ "${TSUKURI_VERIFY_FORCE:-0}" = 1 ]; then
    echo "headroom: TSUKURI_VERIFY_FORCE=1, continuing"
    exit 0
  fi
  echo "headroom: wait for another job to finish, or run a smaller scope; back off a running job if full avg60 stays above 20% or swap-in stays over the limit for a minute"
  exit 1
fi
echo "headroom OK"

#!/usr/bin/env bash
# headroom.sh: read the machine before a heavy job (a build captures 1,664 frames in Chromium and runs ffmpeg).
# Launch only if all four hold (operator limits of 2026-10-29), else exit 1 and say which is short:
#   1. MemAvailable after the job's expected demand is at least 20% of total RAM;
#   2. swap-in (pswpin change in /proc/vmstat over a 10 s sample) is under 1,000 pages per second;
#   3. memory PSI `full` avg60 is under 10% (never gated on avg10);
#   4. the load average (1 minute) is under the number of CPU threads.
# REEBEAT_VERIFY_DEMAND_MIB is the job's expected memory (default 4096: set it from a measured run). REEBEAT_VERIFY_FORCE=1 prints the
# shortage and continues; the run's headroom.txt records it. I/O pressure is printed, never gated.
set -euo pipefail

root=${REEBEAT_VERIFY_ROOT:-$HOME/.local/state/reebeat-verify}
mkdir -p "$root"
demand_mib=${REEBEAT_VERIFY_DEMAND_MIB:-4096}

psi() { awk -v k="$1" -v f="$2" '$1 == k { for (i = 2; i <= NF; i++) { split($i, a, "="); if (a[1] == f) print a[2] } }' "/proc/pressure/$3"; }
pswpin() { awk '$1 == "pswpin" { print $2 }' /proc/vmstat; }

before=$(pswpin); sleep 10; after=$(pswpin)
swapin_rate=$(( (after - before) / 10 ))

full60=$(psi full avg60 memory)
some10=$(psi some avg10 memory)
io10=$(psi some avg10 io)
total_kib=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
avail_kib=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
cpus=$(nproc)
load1=$(cut -d' ' -f1 /proc/loadavg)
disk_free_mib=$(df --output=avail -BM "$root" | tail -1 | tr -dc '0-9')
after_demand_mib=$(( avail_kib / 1024 - demand_mib ))
need_mib=$(( total_kib / 1024 / 5 ))

echo "headroom: MemAvailable=$((avail_kib / 1024)) MiB, demand ${demand_mib} MiB, left $after_demand_mib MiB, needed $need_mib MiB (20% of $((total_kib / 1024)) MiB)"
echo "headroom: swap-in ${swapin_rate} pages/s over 10 s; memory PSI full avg60=$full60 (some avg10=$some10, printed); io PSI some avg10=$io10 (printed)"
echo "headroom: load1=$load1 on $cpus CPU threads; free disk at $root=${disk_free_mib} MiB"

short=()
[ "$after_demand_mib" -ge "$need_mib" ] || short+=("MemAvailable after the job would be $after_demand_mib MiB, under 20% of RAM ($need_mib MiB)")
[ "$swapin_rate" -lt 1000 ] || short+=("swap-in is $swapin_rate pages/s, not under 1,000")
awk -v v="$full60" 'BEGIN { exit !(v >= 10) }' && short+=("memory PSI full avg60 is $full60, not under 10")
awk -v l="$load1" -v c="$cpus" 'BEGIN { exit !(l >= c) }' && short+=("load1 $load1 is not under $cpus CPU threads")
[ "$disk_free_mib" -ge 2048 ] || short+=("less than 2 GiB free at $root")

if [ "${#short[@]}" -gt 0 ]; then
  printf 'headroom SHORT: %s\n' "${short[@]}"
  if [ "${REEBEAT_VERIFY_FORCE:-0}" = 1 ]; then
    echo "headroom: REEBEAT_VERIFY_FORCE=1, continuing"
    exit 0
  fi
  echo "headroom: wait for another job to finish, or run a smaller scope; back off a running job if full avg60 stays above 20% or swap-in stays over the limit for a minute"
  exit 1
fi
echo "headroom OK"

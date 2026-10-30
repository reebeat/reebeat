#!/usr/bin/env bash
# Spec 0017 evidence (F3): a directory the gate cannot read fails both the old gate and the new one. Run as an
# unprivileged user (uid 65534), because root reads a directory at mode 000. The old gate is
# tools/quality/checkTiers.ts and tiers.ts at 56a2155 (the last commit that has them; origin/main lost them when spec
# 0017 merged), written back as untracked copies for the run and removed after it (the new gate reads them as
# tools/quality files, so it counts two files more than on the committed tree).
# Usage: docs/specs/0017-evidence/unreadable.sh > docs/specs/0017-evidence/unreadable.txt (from the repository root,
# as root, so setpriv can drop to uid 65534)
set -uo pipefail
locked=packages/core/src/locked
cleanup() {
  chmod 755 "$locked" 2>/dev/null
  rm -rf "$locked" tools/quality/checkTiers.ts tools/quality/tiers.ts
}
trap cleanup EXIT
old_gate=56a2155
for file in tools/quality/checkTiers.ts tools/quality/tiers.ts; do
  git show "$old_gate:$file" > "$file" || exit 2
done
as_nobody="setpriv --reuid=65534 --regid=65534 --clear-groups"
old="node --experimental-strip-types tools/quality/checkTiers.ts"
new="node node_modules/ox-dep-lint/dist/cli.mjs --config oxDepLint.config.ts"

verdicts() {
  echo "\$ $as_nobody $old"
  $as_nobody $old 2>&1 | tail -2
  echo "old exit ${PIPESTATUS[0]}"
  echo "\$ $as_nobody $new"
  $as_nobody $new 2>&1 | tail -2
  echo "new exit ${PIPESTATUS[0]}"
}

echo "== clean tree"
verdicts
echo "== $locked at mode 000"
mkdir -p "$locked"
echo 'export const x = 1;' > "$locked/index.ts"
chmod 000 "$locked"
verdicts

# Revision 2026-10-30 (review round 1): a release scratch tree that vanishes or cannot be read mid-walk is not read,
# because it is ignored; the same tree is what failed CI run 41080399764 (`unreadable-path tools/quality/.scan-*`).
chmod 755 "$locked"
rm -rf "$locked"
scratch=tools/quality/.scan-demo/packages/probe/src
echo "== $scratch at mode 000 (a release.test.ts scratch tree)"
mkdir -p "$scratch"
echo 'export const x = 1;' > "$scratch/index.ts"
chmod 000 "$scratch"
echo "\$ $as_nobody $new"
$as_nobody $new 2>&1 | tail -2
echo "new exit ${PIPESTATUS[0]}"
chmod 755 "$scratch"
rm -rf tools/quality/.scan-demo

#!/usr/bin/env bash
# Plants one violation per guarantee of the old tier gate, runs the old gate (when present) and the new one on the
# same tree, prints both verdicts and the new gate's findings, and reverts the plant.
# Usage: agreement.sh <worktree> [old|noold]
# Spec 0017 evidence. agreement-before.txt: origin/main at 56a2155 plus ox-dep-lint and its configuration (then named
# ox-dep-lint.config.ts, found by default; the same kinds, classes, ignore, baseline and imports), with
# tiers.ts and checkTiers.ts still in place. agreement-after.txt: the branch head, with origin/main's tiers.ts and
# checkTiers.ts written back as untracked copies for the run and removed after it (`git show origin/main:<path>`).
# As root, mode 000 does not deny a read, so the unreadable row is 0 and 0 here; unreadable-*.txt is the same plant
# run as an unprivileged user (setpriv --reuid=65534).
set -uo pipefail
root=$1
mode=${2:-old}
cd "$root" || exit 2
out=$(mktemp -d)

old() { if [ "$mode" = old ]; then timeout 60 bun tools/quality/checkTiers.ts >"$out/old.out" 2>&1; echo $?; else echo "-"; fi; }
new() { timeout 60 bun run check:tiers >"$out/new.out" 2>&1; echo $?; }
# Only packages/ and the planted paths are reset: work in progress elsewhere (tools/quality) is left alone.
revert() {
  chmod -R u+rwx packages 2>/dev/null
  git checkout -q -- packages
  git clean -fdq packages
  rm -rf packages/core/dist packages/core/src/dist packages/.template packages/mystery packages/empty \
    packages/core/src/link packages/core/src/fifo.ts tools/extra
}

run() {
  local name=$1
  local o n
  o=$(old)
  n=$(new)
  printf '%-58s old=%s new=%s\n' "$name" "$o" "$n"
  grep -E ' (forbidden-edge|unknown-workspace-package|relative-import-leaves-package|computed-import|package-without-kind|directory-without-package|symbolic-link|unreadable-path|unresolved-import|stale-baseline|invalid-package|parse-error):' "$out/new.out" | sed 's/^/    new: /' | head -4
  if [ "$mode" = old ]; then grep -oE '@tsukuri/[a-z-]+ \([a-z ]+\): .*' "$out/old.out" | head -2 | sed 's/^/    old: /'; fi
  revert
}

src=packages/core/src/plant.ts

echo "== clean tree"
run "clean tree"

echo "== tier table and allowed edges"
printf 'export {};\nimport "@tsukuri/services";\n' >$src; run "library imports a service (AGENTS.md example)"
printf 'import "@tsukuri/cache-fs";\n' >packages/services/src/plant.ts; run "service imports an adapter"
printf 'import "@tsukuri/encode-ffmpeg/something";\n' >packages/cache-fs/src/plant.ts; run "adapter imports another adapter"
printf 'import "@tsukuri/encode-ffmpeg";\n' >packages/pipeline/src/plant.ts; run "program imports an adapter"
printf 'import "@tsukuri/pipeline";\n' >packages/cache-fs/src/plant.ts; run "adapter imports a program"
printf 'import "@tsukuri/cli";\n' >$src; run "library imports a tool"
printf 'import "@tsukuri/subtitles";\n' >$src; run "library imports a library (allowed)"
printf 'import "@tsukuri/cache-fs";\nimport "@tsukuri/pipeline";\n' >packages/cli/src/plant.ts; run "tool imports an adapter and a program (allowed)"
printf 'import "@tsukuri/core";\n' >packages/cache-fs/src/plant.ts; run "adapter imports a library (allowed)"

echo "== manifest edges, all four fields"
for field in dependencies devDependencies optionalDependencies peerDependencies; do
  bun -e "const f='packages/core/package.json';const m=JSON.parse(await Bun.file(f).text());m['$field']={...(m['$field']??{}),'@tsukuri/services':'workspace:*'};await Bun.write(f,JSON.stringify(m,null,2)+'\n')"
  run "core package.json $field names @tsukuri/services"
done
bun -e "const f='packages/core/package.json';const m=JSON.parse(await Bun.file(f).text());m.dependencies={...(m.dependencies??{}),'@tsukuri/mystery':'workspace:*'};await Bun.write(f,JSON.stringify(m,null,2)+'\n')"
run "core depends on @tsukuri/mystery (no such package)"

echo "== static, re-export, dynamic, type-only and computed imports"
printf 'export * from "@tsukuri/services";\n' >$src; run "re-export of a service from a library"
printf 'export { x } from "@tsukuri/services";\n' >$src; run "named re-export of a service from a library"
printf 'export const a = import("@tsukuri/services");\n' >$src; run "dynamic import of a service from a library"
printf 'import type { X } from "@tsukuri/services";\nexport type Y = X;\n' >$src; run "type-only import of a service from a library"
printf 'export const b = (name: string) => import(name);\n' >$src; run "computed dynamic import in a library"
printf 'export const b = (name: string) => import(name);\n' >packages/cache-fs/src/plant.ts; run "computed dynamic import in an adapter"
printf 'export const b = (name: string) => import(name);\n' >packages/cli/src/plant.ts; run "computed dynamic import in a tool"

echo "== relative paths"
printf 'import "../../services/src/index.ts";\n' >$src; run "relative import into another package's sources"
printf 'import "../../../commitlint.config.ts";\n' >$src; run "relative import leaving packages/ (repository file)"
printf 'import "../../../tools/quality/release.ts";\n' >$src; run "relative import leaving packages/ (tools package)"

echo "== directories under packages/ in no tier"
mkdir -p packages/mystery && printf '{"name":"@tsukuri/mystery","version":"0.0.0","private":true,"license":"Apache-2.0"}\n' >packages/mystery/package.json; run "packages/mystery with a package.json (AGENTS.md example)"
mkdir -p packages/mystery/src && printf 'export {};\n' >packages/mystery/src/index.ts; run "packages/mystery without a package.json, with sources"
mkdir -p packages/empty; run "packages/empty, an empty directory"
mkdir -p packages/.template && printf '{"name":"@tsukuri/template"}\n' >packages/.template/package.json; run "packages/.template, a dot directory"

echo "== symbolic links under a package's sources"
ln -s ../../services/src packages/core/src/link; run "ln -s ../../services/src packages/core/src/link (AGENTS.md example)"
ln -s ../package.json packages/core/src/link; run "a link to a file"
ln -s nowhere packages/core/src/link; run "a dangling link"
mkdir -p packages/core/test && ln -s ../../services/src packages/core/test/link; run "a link inside test/ (skipped by both)"

echo "== unreadable directory"
mkdir -p packages/core/src/locked && printf 'export {};\n' >packages/core/src/locked/a.ts && chmod 000 packages/core/src/locked
if [ "$(id -u)" = 0 ]; then echo "    (running as root: mode 000 does not deny root; see the unprivileged run)"; fi
run "packages/core/src/locked with mode 000"

echo "== skips: test, live, fixtures, dist, .d.ts"
for path in test/plant.ts src/test/plant.ts live/plant.ts src/live/plant.ts test/fixtures/plant.ts src/fixtures/plant.ts dist/plant.ts src/plant.d.ts; do
  mkdir -p "packages/core/$(dirname "$path")" && printf 'import "@tsukuri/services";\n' >"packages/core/$path"
  run "violation in packages/core/$path (skipped)"
done

echo "== differences (the new gate is stricter, or the old one read it and the new does not)"
mkdir -p packages/core/src/dist && printf 'import "@tsukuri/services";\n' >packages/core/src/dist/plant.ts; run "violation in packages/core/src/dist (nested dist)"
printf 'import "@tsukuri/services";\n' >packages/core/src/plant.js; run "violation in a .js file"
printf 'export const s = require("@tsukuri/services");\n' >$src; run "require of a service"
printf 'export const s = import("\\u0040tsukuri/services");\n' >$src; run "escaped specifier"
mkdir -p tools/extra && printf '{"name":"@tsukuri/extra","version":"0.0.0","private":true,"license":"Apache-2.0"}\n' >tools/extra/package.json; run "tools/extra, a new tools package in no kind"
mkfifo packages/core/src/fifo.ts; run "a FIFO under a package's sources"

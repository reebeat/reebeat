#!/usr/bin/env bash
# Spec 0017 evidence (F4): weakens oxDepLint.config.ts one way at a time and runs the tier gate's tests, which must
# fail. Prints each mutation's command and the failing tests; restores the configuration after each run.
# Usage: docs/specs/0017-evidence/mutations.sh > docs/specs/0017-evidence/mutations.txt (from the repository root)
set -uo pipefail
config=oxDepLint.config.ts
saved=$(mktemp)
cp "$config" "$saved"
trap 'cp "$saved" "$config"; rm -f "$saved"' EXIT

run() {
  bunx --no-install vp test run tools/quality/test/tierGate.test.ts 2>&1 | grep -E '^ +(×|✓ .*negative)|Tests +[0-9]' | grep -E '×|Tests'
}

echo "== unmutated"
echo "\$ bunx --no-install vp test run tools/quality/test/tierGate.test.ts"
run

mutate() {
  local name=$1 expression=$2
  echo "== mutation: $name"
  echo "\$ sed -i -E '$expression' $config"
  sed -i -E "$expression" "$config"
  if cmp -s "$config" "$saved"; then echo "the mutation changed nothing"; exit 1; fi
  run
  cp "$saved" "$config"
}

mutate "library may use service" '/^    library: \{/,/^    \},/ s/mayUse: \["library"\],/mayUse: ["library", "service"],/'
mutate "no .d.ts in the unchecked class" '/"\*\*\/\*\.d\.ts",/d'
mutate "tools/oxlint not ignored" '/"tools\/oxlint\/\*\*",/d'
mutate "encode-ffmpeg dropped from the adapter kind" '/"packages\/encode-ffmpeg",/d'
mutate "release scratch trees not ignored" '/"packages\/\*\/\.unstable-scan-\*\/\*\*",|"tools\/quality\/\.scan-\*\/\*\*",/d'

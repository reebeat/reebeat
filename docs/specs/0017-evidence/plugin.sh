#!/usr/bin/env bash
# Spec 0017 evidence (F5): plants a library importing a service and shows that `vp check` (the ox-dep-lint oxlint
# plugin, rule dep-lint/imports) reports it where it is written. Removes the plant afterwards.
# Usage: docs/specs/0017-evidence/plugin.sh > docs/specs/0017-evidence/plugin.txt (from the repository root)
set -uo pipefail
plant=packages/core/src/plant.ts
trap 'rm -f "$plant"' EXIT
printf 'export {};\nimport "@tsukuri/services";\n' > "$plant"
echo "\$ printf 'export {};\\nimport \"@tsukuri/services\";\\n' > $plant"
echo "\$ bunx --no-install vp check"
bunx --no-install vp check 2>&1 | grep -A6 'dep-lint(imports)'
echo "exit ${PIPESTATUS[0]}"

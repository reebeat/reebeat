#!/bin/sh
# Throwaway (spec 0007, Q4): the schema-drift control. Add an optional field `note` to ElementSchema in the vendored
# plan.ts, run the property tests of both codecs, then restore plan.ts. Expect: the profile codec test fails (it drops
# the field), the generic structural codec passes, the JSON control passes.
# Usage: sh src/drift.sh   (from spike/scxml/; needs a clean vendor/0004/plan.ts)
set -u
cd "$(dirname "$0")/.."
P=vendor/0004/plan.ts
cp "$P" /tmp/plan.ts.orig
trap 'cp /tmp/plan.ts.orig "$P"' EXIT
sed -i '0,/  visible: Schema.Boolean,/s##  visible: Schema.Boolean,\n  note: Schema.optionalKey(Schema.String),#' "$P"
grep -n "note: Schema.optionalKey" "$P"
RUNS=1000 bun test --timeout 300000 src/roundtrip.test.ts 2>&1 | cut -c1-200

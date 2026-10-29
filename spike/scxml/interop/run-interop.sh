#!/bin/sh
# Throwaway (spec 0007, Q2 and Q3): run every interop probe on fixtures/same-id.scxml and write the raw output to
# results/interop-*.txt. Needs network (npm, GitHub, W3C, nixpkgs). Work files go to $WORK (default /tmp/scxml-interop).
# Usage: sh interop/run-interop.sh            (from spike/scxml/)
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-/tmp/scxml-interop}
DOC=$HERE/fixtures/same-id.scxml
OUT=$HERE/results
mkdir -p "$WORK" "$OUT"

# ---- 1. Apache Commons SCXML: built from master (Maven), probe in java/Probe.java -----------------------------------
if [ ! -d "$WORK/commons-scxml" ]; then git clone --depth 1 https://github.com/apache/commons-scxml.git "$WORK/commons-scxml"; fi
(
  cd "$WORK/commons-scxml" || exit 1
  git rev-parse HEAD
  nix shell nixpkgs#maven nixpkgs#jdk17 -c mvn -q -B -DskipTests -Drat.skip -Dcheckstyle.skip -Dspotbugs.skip -Dpmd.skip \
    -Danimal.sniffer.skip -Djapicmp.skip -Dmaven.javadoc.skip -Dcyclonedx.skip package >/dev/null 2>&1
  nix shell nixpkgs#maven nixpkgs#jdk17 -c mvn -q -B org.apache.maven.plugins:maven-dependency-plugin:3.6.1:build-classpath \
    -Dmdep.outputFile="$WORK/cp.txt" >/dev/null 2>&1
) > "$OUT/interop-commons-build.txt" 2>&1
CP=$WORK/commons-scxml/target/commons-scxml2-2.0-SNAPSHOT.jar:$(cat "$WORK/cp.txt")
mkdir -p "$WORK/probe"
{
  echo "# commit: $(sed -n 1p "$OUT/interop-commons-build.txt")"
  nix shell nixpkgs#jdk17 -c sh -c "javac -cp '$CP' -d '$WORK/probe' '$HERE/interop/java/Probe.java' && java -cp '$WORK/probe:$CP' Probe '$DOC' '$WORK/out-commons.scxml'" 2>&1 \
    | grep -E "WARNING: Ign|serialized|loaded|^  state" | sed 's/ at Line number.*//' | sort | uniq -c | sort -rn
  echo "# input bytes: $(wc -c < "$DOC")"
} > "$OUT/interop-commons.txt"

# ---- 2. SCION (npm scxml 5.0.4) under jsdom ---------------------------------------------------------------------------
mkdir -p "$WORK/scion"
(cd "$WORK/scion" && [ -f package.json ] || echo '{"name":"scion-probe","private":true}' > package.json
 cd "$WORK/scion" && bun add scxml@5.0.4 jsdom regenerator-runtime >/dev/null 2>&1)
cp "$HERE/interop/scion-probe.mjs" "$WORK/scion/probe.mjs"
(cd "$WORK/scion" && node probe.mjs "$DOC" 2>&1) > "$OUT/interop-scion.txt"

# ---- 3. Qt SCXML qscxmlc (nixpkgs) -------------------------------------------------------------------------------------
QT=$(nix build nixpkgs#qt6.qtscxml --no-link --print-out-paths 2>/dev/null | head -1)
mkdir -p "$WORK/qt"
{
  echo "# $QT"
  "$QT/libexec/qscxmlc" --version
  (cd "$WORK/qt" && "$QT/libexec/qscxmlc" -o same-id "$DOC"; echo "exit=$?"; wc -c same-id.cpp same-id.h)
  echo "occurrences of 'reebeat' or 'rb:' in generated sources: $(cat "$WORK/qt/same-id.cpp" "$WORK/qt/same-id.h" | grep -c 'reebeat\|rb:')"
  echo "state names in generated cpp:"; grep -o '"sc[0-9]"' "$WORK/qt/same-id.cpp" | sort -u | tr '\n' ' '; echo
} > "$OUT/interop-qt.txt" 2>&1

# ---- 4. XState: v5 has no SCXML import, v6 has @xstate/scxml ----------------------------------------------------------
mkdir -p "$WORK/xs-v5" "$WORK/xs-run"
{
  (cd "$WORK/xs-v5" && npm pack xstate@5.33.3 --silent >/dev/null 2>&1 && tar xzf xstate-5.33.3.tgz \
    && echo "xstate@5.33.3: files with scxml in the name: $(find package -iname '*scxml*' | wc -l)" \
    && echo "xstate@5.33.3: files that mention scxml: $(grep -rli scxml package | wc -l) (only comments, e.g. $(grep -rli scxml package | head -1))" \
    && echo "xstate@5.33.3: createMachineFromSCXML etc: $(grep -rli 'createMachineFromSCXML\|fromScxml' package | wc -l) files")
  (cd "$WORK/xs-v5" && npm pack xstate@4.38.3 --silent >/dev/null 2>&1 && mkdir -p v4 && tar xzf xstate-4.38.3.tgz -C v4 \
    && echo "xstate@4.38.3: $(ls v4/package/lib | grep -i scxml | tr '\n' ' ')")
} > "$OUT/interop-xstate-versions.txt" 2>&1
(cd "$WORK/xs-run" && [ -f package.json ] || echo '{"name":"xs-run","private":true,"type":"module"}' > package.json
 cd "$WORK/xs-run" && bun add xstate@6.0.0-alpha.71 @xstate/scxml@1.0.0-alpha.4 >/dev/null 2>&1)
cp "$HERE/interop/xstate-scxml-probe.mjs" "$WORK/xs-run/probe.mjs"
(cd "$WORK/xs-run" && node probe.mjs "$DOC" 2>&1; echo "xstate: $(grep '"version"' node_modules/xstate/package.json)"; echo "@xstate/scxml: $(grep '"version"' node_modules/@xstate/scxml/package.json)") > "$OUT/interop-xstate-scxml.txt"

# ---- 5. W3C XSD: full driver versus the restricted driver ------------------------------------------------------------
# The W3C site rate-limits curl (HTTP 429); the modules are expected in $XSD (default $WORK/xsd): scxml.xsd,
# scxml-module-core/data/external.xsd, scxml-datatypes.xsd, scxml-attribs.xsd, scxml-contentmodels.xsd, xml.xsd
# (and xml.xsd must be named locally in scxml.xsd and scxml-attribs.xsd). Source: https://www.w3.org/2011/04/SCXML/
XSD=${XSD:-$WORK/xsd}
if [ ! -f "$XSD/scxml.xsd" ]; then # best effort: the W3C site answers 429 when asked quickly
  mkdir -p "$XSD"
  for f in scxml scxml-module-core scxml-module-data scxml-module-external scxml-datatypes scxml-attribs scxml-contentmodels scxml-copyright; do
    curl -fsS -A "reebeat-spike/0007" -o "$XSD/$f.xsd" "https://www.w3.org/2011/04/SCXML/$f.xsd"; sleep 3
  done
  curl -fsS -A "reebeat-spike/0007" -o "$XSD/xml.xsd" https://www.w3.org/2001/xml.xsd
  sed -i 's#http://www.w3.org/2001/xml.xsd#xml.xsd#' "$XSD/scxml.xsd" "$XSD/scxml-attribs.xsd"
fi
if [ -f "$XSD/scxml.xsd" ]; then
  cp "$HERE/interop/xsd/profile-driver.xsd" "$XSD/"
  mutate() { # name, sed expression
    sed "$2" "$DOC" > "$WORK/bad-$1.scxml"; }
  mutate script '0,/<\/state>/s##<onentry><script>x=1</script></onentry></state>#'
  mutate cond '0,/event="rb.next"/s##event="rb.next" cond="1==1"#'
  mutate attr '0,/<state /s##<state bogus="1" #'
  mutate send '0,/<\/state>/s##<onentry><send event="e"/></onentry></state>#'
  mutate log '0,/<\/state>/s##<onentry><log expr="1"/></onentry></state>#'
  mutate invoke '0,/<\/state>/s##<invoke type="x"/></state>#'
  mutate datamodel '0,/<state /s##<datamodel><data id="x"/></datamodel><state #'
  mutate rootscript '0,/<state /s##<script>x=1</script><state #'
  mutate rbbogus '0,/<rb:element /s##<rb:bogus x="1"/><rb:element #'
  {
    for driver in scxml.xsd profile-driver.xsd; do
      echo "## $driver"
      for f in "$DOC" "$WORK"/bad-*.scxml; do
        printf '%s: ' "$(basename "$f")"
        nix shell nixpkgs#libxml2 -c xmllint --noout --nonet --schema "$XSD/$driver" "$f" 2>&1 | tail -1 | sed 's#.*/##' | cut -c1-120
      done
    done
    echo "## core-module-only driver (does the W3C core module compile without the data and external modules?)"
    sed '/scxml-module-data.xsd/d; /scxml-module-external.xsd/d' "$XSD/profile-driver.xsd" > "$XSD/core-only-driver.xsd"
    nix shell nixpkgs#libxml2 -c xmllint --noout --nonet --schema "$XSD/core-only-driver.xsd" "$DOC" 2>&1 | grep -m2 "parser error\|failed to compile" | sed 's#.*/##' | cut -c1-200
  } > "$OUT/interop-xsd.txt" 2>&1
else
  echo "XSD modules not found in $XSD; skipped" > "$OUT/interop-xsd.txt"
fi
echo done

# ---- 6. Two side findings (rerun on purpose) -----------------------------------------------------------------------------
# (a) Commons SCXML takes a foreign attribute for the SCXML one of the same local name: rb:ir renamed to rb:version.
sed 's/rb:ir=/rb:version=/' "$DOC" > "$WORK/collide.scxml"
{
  nix shell nixpkgs#jdk17 -c sh -c "java -cp '$WORK/probe:$CP' Probe '$WORK/collide.scxml' '$WORK/collide-out.scxml'" 2>&1 | grep -m1 "Exception"
} > "$OUT/interop-commons-collision.txt" 2>&1
# (b) SCION keeps the attributes of a foreign element; does it keep its text content?
printf '%s' '<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:rb="urn:reebeat:ir:1" version="1.0" initial="a"><state id="a"><rb:t k="ATTRVALUE">TEXTCONTENT</rb:t></state></scxml>' > "$WORK/text.scxml"
cat > "$WORK/scion/text-probe.mjs" <<'JS'
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
for (const k of ["document", "window", "navigator"]) Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true });
globalThis.regeneratorRuntime = (await import("regenerator-runtime")).default;
const scxml = createRequire(import.meta.url)("./node_modules/scxml/dist/scxml.js");
scxml.documentStringToModel(null, readFileSync(process.argv[2], "utf8"), (err, model) => {
  const code = model.compiledInvokeConstructors[0].module.code;
  console.log("attribute value kept:", code.includes("ATTRVALUE"), " text content kept:", code.includes("TEXTCONTENT"));
});
JS
(cd "$WORK/scion" && node text-probe.mjs "$WORK/text.scxml" 2>&1) > "$OUT/interop-scion-text.txt"
echo done

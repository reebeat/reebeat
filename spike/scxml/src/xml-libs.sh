#!/bin/sh
# Throwaway (spec 0007, Q4): XML library sizes and licences, and the line counts of the codec. From spike/scxml/.
set -u
cd "$(dirname "$0")/.."
echo "## npm (license, version, unpackedSize)"
for p in fast-xml-parser saxes @xmldom/xmldom xmlbuilder2 txml sax; do
  printf '%s: ' "$p"; npm view "$p" license version dist.unpackedSize 2>/dev/null | tr '\n' ' '; echo
done
echo "## on disk (du -sb)"; du -sb node_modules/saxes node_modules/xmlchars node_modules/fast-xml-parser node_modules/fast-xml-builder
grep '"license"' node_modules/xmlchars/package.json node_modules/fast-xml-builder/package.json
echo "## bun build --minify --target=node, parser only"
mkdir -p /tmp/xml-libs
printf 'import { SaxesParser } from "saxes";\nexport const p = new SaxesParser({ xmlns: true });\n' > src/_sax.ts
printf 'import { XMLParser, XMLBuilder } from "fast-xml-parser";\nexport const p = new XMLParser({ preserveOrder: true, ignoreAttributes: false });\nexport const b = new XMLBuilder({ preserveOrder: true, ignoreAttributes: false });\n' > src/_fxp.ts
for f in _sax _fxp; do
  bun build src/$f.ts --minify --target=node --outfile=/tmp/xml-libs/$f.js >/dev/null 2>&1
  echo "$f minified $(wc -c < /tmp/xml-libs/$f.js) B, gzip $(gzip -c /tmp/xml-libs/$f.js | wc -c) B"
done
rm -f src/_sax.ts src/_fxp.ts
echo "## lines"; wc -l src/xml.ts src/profile.ts src/codec.ts src/generic.ts vendor/0004/plan.ts vendor/0004/graph.ts
echo "codec.ts mapping section (up to the codec entry-point comment): $(grep -n 'the codec: text' src/codec.ts | cut -d: -f1) lines"

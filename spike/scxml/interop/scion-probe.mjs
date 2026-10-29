import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
for (const k of ["document", "window", "navigator"]) Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true });
globalThis.regeneratorRuntime = (await import("regenerator-runtime")).default;
import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const scxml = require("./node_modules/scxml/dist/scxml.js");
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
scxml.documentStringToModel(null, src, (err, model) => {
  if (err) { console.log("ERR", err); return; }
  const code = model.compiledInvokeConstructors[0].module.code; const i = code.indexOf("{urn:reebeat:ir:1}element"); for (const needle of ["Another box","Picture a box on a screen.","Here"]) console.log("needle", needle, code.includes(needle)); const words = (src.match(/<rb:w>/g)??[]).length; console.log("doc rb:w", words, "compiled $type rb w", (code.match(/\{urn:reebeat:ir:1\}w\"/g)??[]).length);
  const n = (re) => (code.match(re) ?? []).length;
  console.log("compiled code bytes", code.length, "foreign element actions", n(/"\$type": "\{urn:reebeat:ir:1\}/g), "foreign attr keys", n(/"\{urn:reebeat:ir:1\}[a-z-]+":/g));
  console.log("doc foreign elements", (src.match(/<rb:/g) ?? []).length, "doc foreign attrs", (src.match(/ rb:[a-z-]+=/g) ?? []).length);
  model.prepare((e, fn) => {
    if (e) { console.log("prepare ERR", String(e.message ?? e).slice(0, 200)); return; }
    const sc = new scxml.scion.Statechart(fn);
    console.log("initial configuration:", JSON.stringify(sc.start()));
    const trace = [];
    for (let i = 0; i < 7; i++) trace.push(JSON.stringify(sc.gen("rb.next")));
    console.log(trace.join("\n"));
  });
});

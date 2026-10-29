// Throwaway: spec 0007 question 1. How much of the IR of stories/same-id lands in SCXML's own vocabulary?
// Two counts: (A) IR leaves (every scalar of the Graph JSON), each classified by the construct that carries it;
// (B) the generated document's nodes (elements, and attribute or text slots) by namespace.
import { readFileSync } from "node:fs";

import { prefixes, rbNs, scxmlNs } from "./profile.ts";
import type { XmlElement } from "./xml.ts";
import { parseXml } from "./xml.ts";

const graph = JSON.parse(readFileSync(new URL("../fixtures/same-id.graph.json", import.meta.url), "utf8"));

// ---- (A) IR leaves ---------------------------------------------------------------------------------------------------
type Class = "native" | "foreign" | "unrepresentable";
const counts: Record<Class, number> = { foreign: 0, native: 0, unrepresentable: 0 };
const byGroup: Record<string, Record<Class, number>> = {};
const classify = (path: (string | number)[]): [string, Class] => {
  const p = path.map((x) => (typeof x === "number" ? "[]" : x)).join(".");
  if (/^scenes\.\[\]\.id$/u.test(p)) return ["scene id -> state@id", "native"];
  if (/^scenes\.\[\]\.effects/u.test(p)) return ["effects (event expressions)", "foreign"];
  if (/^scenes\.\[\]\.events/u.test(p)) return ["derived events (let)", "foreign"];
  if (/^scenes\.\[\]\.elements/u.test(p)) return ["elements", "foreign"];
  if (/^scenes\.\[\]\.lines/u.test(p)) return ["lines (narration)", "foreign"];
  if (/^chapters/u.test(p)) return ["chapters", "foreign"];
  if (/^scenes\.\[\]\.(chapterId|heading|line|transition)$/u.test(p)) return ["scene properties", "foreign"];
  return ["story properties (title, author, speed, version)", "foreign"];
};
const walk = (v: unknown, path: (string | number)[]): void => {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i]));
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  else {
    const [group, cls] = classify(path);
    counts[cls]++;
    byGroup[group] ??= { foreign: 0, native: 0, unrepresentable: 0 };
    (byGroup[group] as Record<Class, number>)[cls]++;
  }
};
walk(graph, []);
const leaves = counts.native + counts.foreign + counts.unrepresentable;
// Ordering: the IR's scene array order is an edge per neighbouring pair; SCXML carries it natively
// (document order plus <transition target>).
const orderEdges = graph.scenes.length - 1;
console.log("## (A) IR leaves of stories/same-id by carrier");
for (const [g, c] of Object.entries(byGroup)) console.log(`${g.padEnd(52)} native ${String(c.native).padStart(4)}  foreign ${String(c.foreign).padStart(4)}`);
console.log(`leaves: ${leaves}; native ${counts.native} (${((100 * counts.native) / leaves).toFixed(1)} %); foreign ${counts.foreign}; unrepresentable ${counts.unrepresentable}`);
const withOrder = counts.native + orderEdges;
console.log(
  `with the ${orderEdges} scene-order edges counted as facts: native ${withOrder} of ${leaves + orderEdges} (${((100 * withOrder) / (leaves + orderEdges)).toFixed(1)} %)`
);

// ---- (B) document nodes by namespace -----------------------------------------------------------------------------------
const doc = parseXml(readFileSync(new URL("../fixtures/same-id.scxml", import.meta.url), "utf8"), prefixes);
const tally = { elNative: 0, elForeign: 0, slotNative: 0, slotNativeConstant: 0, slotForeign: 0 };
const visit = (e: XmlElement): void => {
  const native = e.uri === scxmlNs;
  if (native) tally.elNative++;
  else if (e.uri === rbNs) tally.elForeign++;
  for (const [k, v] of Object.entries(e.attrs)) {
    const foreignAttr = k.startsWith("rb:") || !native;
    if (foreignAttr) tally.slotForeign++;
    // constants and derived values carry no IR fact: version, event, target (next state), initial (first state)
    else if (["version", "event", "target", "initial"].includes(k)) tally.slotNativeConstant++;
    else tally.slotNative++;
    void v;
  }
  e.children.forEach((c) => typeof c !== "string" && visit(c));
};
visit(doc);
console.log("\n## (B) document nodes");
console.log(tally);
const elTotal = tally.elNative + tally.elForeign;
console.log(`elements: ${tally.elNative} SCXML of ${elTotal} (${((100 * tally.elNative) / elTotal).toFixed(1)} %)`);
const slots = tally.slotNative + tally.slotNativeConstant + tally.slotForeign;
console.log(
  `attribute slots: ${tally.slotNative} SCXML carrying an IR fact, ${tally.slotNativeConstant} SCXML constant or derived, ${tally.slotForeign} rb: or in rb: elements (of ${slots})`
);

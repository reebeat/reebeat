// Throwaway: what does Effect's Arbitrary generate for GraphSchema? (Is the property test exercising the constructs?)
import { Arbitrary, Effect } from "effect";

import { GraphSchema } from "../vendor/0004/graph.ts";

const samples = await Effect.runPromise(
  Arbitrary.sampleEffect(Arbitrary.schema(GraphSchema), { count: 300, seed: 7 })
);
const kinds = new Map<string, number>();
const walk = (v: unknown): void => {
  if (Array.isArray(v)) v.forEach(walk);
  else if (v !== null && typeof v === "object") {
    const k = (v as Record<string, unknown>)["kind"];
    if (typeof k === "string") kinds.set(k, (kinds.get(k) ?? 0) + 1);
    Object.values(v).forEach(walk);
  }
};
let scenes = 0;
let effects = 0;
let withUntil = 0;
let withAbsolute = 0;
let strings = 0;
const countStrings = (v: unknown): void => {
  if (typeof v === "string") strings++;
  else if (Array.isArray(v)) v.forEach(countStrings);
  else if (v !== null && typeof v === "object") Object.values(v).forEach(countStrings);
};
for (const g of samples as any[]) {
  walk(g);
  countStrings(g);
  scenes += g.scenes.length;
  for (const s of g.scenes) {
    effects += s.effects.length;
    for (const f of s.effects) {
      if (f.until !== undefined) withUntil++;
      if ("absoluteFlicks" in f.when) withAbsolute++;
    }
  }
}
console.log({ graphs: samples.length, scenes, effects, withUntil, withAbsolute, strings });
console.log(Object.fromEntries(kinds));

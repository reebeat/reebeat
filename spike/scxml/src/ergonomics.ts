// Throwaway: spec 0007 question 6. Sizes, the git diff of two typical edits in each format, and the merge behaviour of
// concurrent edits under `git merge-file` (the line-based three-way merge git uses), on stories/same-id.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Result } from "effect";

import { jsonCodec } from "../vendor/0004/graph.ts";
import type { Graph } from "../vendor/0004/graph.ts";
import { encodeScxml } from "./codec.ts";
import { encodeGeneric } from "./generic.ts";

const fixture = readFileSync(new URL("../fixtures/same-id.graph.json", import.meta.url), "utf8");
const base: Graph = Result.getOrThrow(jsonCodec.decode(fixture));
const json = (g: Graph): string => Result.getOrThrow(jsonCodec.encode(g)) + "\n";
const scxml = (g: Graph): string => Result.getOrThrow(encodeScxml(g));
const generic = (g: Graph): string => Result.getOrThrow(encodeGeneric(g));
const formats = { generic, json, scxml } as const;

const clone = (g: Graph): any => structuredClone(g);

const size = (label: string, text: string) =>
  console.log(
    `${label.padEnd(8)} ${String(Buffer.byteLength(text)).padStart(6)} bytes ${String(text.split("\n").length - 1).padStart(4)} lines ${String(gzipSync(text).length).padStart(5)} gzip`
  );
console.log("## sizes (stories/same-id)");
for (const [k, f] of Object.entries(formats)) size(k, f(base));

const dir = mkdtempSync(join(tmpdir(), "rb-merge-"));
const run = (args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

const unifiedDiff = (a: string, b: string): string => {
  writeFileSync(join(dir, "a"), a);
  writeFileSync(join(dir, "b"), b);
  return run(["diff", "--no-index", "-U1", "--no-color", "a", "b"]).stdout.split("\n").slice(4).join("\n");
};

// two typical edits: move an element (a cell), retime an effect (an offset)
const moveElement = (g: Graph): Graph => {
  const c = clone(g);
  c.scenes[1].elements.find((e: any) => e.id === "box").cell = "mc";
  return c;
};
const retime = (g: Graph): Graph => {
  const c = clone(g);
  const f1 = c.scenes[3].effects.find((e: any) => e.id === "f1");
  f1.when.event.offset.value = -211680000; // -0.3 s
  f1.written = 'word("slides").start -0.3s';
  return c;
};
for (const [name, edit] of Object.entries({ "move element box (cell ml -> mc)": moveElement, "retime f1 (-0.2 s -> -0.3 s)": retime })) {
  console.log(`\n## diff: ${name}`);
  for (const [k, f] of Object.entries(formats)) {
    const d = unifiedDiff(f(base), f(edit(base)));
    console.log(`--- ${k}: ${d.split("\n").filter((l) => /^[+-]/u.test(l)).length} changed lines\n${d}`);
  }
}

// concurrent edits: pairs of single-leaf edits, merged with git merge-file
const leaves: { path: (string | number)[]; edit: (v: any) => any }[] = [];
const collect = (v: any, path: (string | number)[]): void => {
  if (Array.isArray(v)) v.forEach((x, i) => collect(x, [...path, i]));
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, [...path, k]);
  else {
    const key = path.at(-1);
    if (typeof v === "boolean") leaves.push({ edit: (x) => !x, path });
    else if (typeof v === "number" && (key === "line" || key === "value" || key === "pauseBefore"))
      leaves.push({ edit: (x) => x + 1, path });
    else if (key === "cell") leaves.push({ edit: (x) => (x === "mc" ? "tc" : "mc"), path });
    else if (key === "class") leaves.push({ edit: (x) => (x === "box" ? "label" : "box"), path });
  }
};
collect(base, []);
const apply = (g: Graph, leaf: (typeof leaves)[number]): Graph => {
  const c = clone(g);
  let o = c;
  for (const p of leaf.path.slice(0, -1)) o = o[p];
  const last = leaf.path.at(-1) as string | number;
  o[last] = leaf.edit(o[last]);
  return c;
};

let seed = 12345;
const rnd = (n: number): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};
const pairs = Number(process.env["PAIRS"] ?? 400);
const conflicts = { generic: 0, json: 0, scxml: 0 };
const sameLine = { generic: 0, json: 0, scxml: 0 };
for (let i = 0; i < pairs; i++) {
  let a = rnd(leaves.length);
  let b = rnd(leaves.length);
  while (b === a) b = rnd(leaves.length);
  const la = leaves[a] as (typeof leaves)[number];
  const lb = leaves[b] as (typeof leaves)[number];
  const ga = apply(base, la);
  const gb = apply(base, lb);
  for (const [k, f] of Object.entries(formats) as [keyof typeof formats, (g: Graph) => string][]) {
    writeFileSync(join(dir, "base"), f(base));
    writeFileSync(join(dir, "ours"), f(ga));
    writeFileSync(join(dir, "theirs"), f(gb));
    const r = run(["merge-file", "-p", "ours", "base", "theirs"]);
    if (r.status !== 0) conflicts[k]++;
  }
}
console.log(`\n## concurrent edits: ${pairs} random pairs of single-leaf edits on different leaves (${leaves.length} editable leaves)`);
console.log("conflicts (a conflict here is false: the two edits touch different facts):", conflicts);

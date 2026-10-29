// Runner of the XState v6 spike: `bun run run.ts [--no-network]`. Writes results/results.json and prints a summary.
// Every number in the report comes from this file's output.
import { mkdirSync, writeFileSync } from "node:fs";
import { codecReport, decode, encode } from "./src/codec.ts";
import { generate, type Declared } from "./src/generate.ts";
import { directedGraph, elementsAtEndOfGraphPath, inspection, traversals } from "./src/graphs.ts";
import { effectLog, formatLog, runPure, runSimulated, type LogEntry } from "./src/interpret.ts";
import { loadIr, loadSpeech } from "./src/ir.ts";
import { demos } from "./src/primitives.ts";
import { breakingChanges, cadence, installed, sizes, tsc, windowStart, today } from "./src/risk.ts";
import { sampleFrames } from "./src/frames.ts";

const network = !process.argv.includes("--no-network");
const runs = 20;
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const r1 = (x: number): number => Math.round(x * 100) / 100;
const section = (title: string): void => console.log(`\n== ${title}`);

const ir = loadIr();
const speech = loadSpeech();
const { json, declared } = generate(ir, speech);
const total = declared.totalMs;

mkdirSync("out", { recursive: true });
mkdirSync("results", { recursive: true });
writeFileSync("out/same-id.machine.json", `${JSON.stringify(json, null, 2)}\n`);

// ---------------------------------------------------------------------------------------------------------------- 1
section("1. interpreter at build time");

interface Interpreter {
  readonly name: string;
  readonly run: () => Promise<readonly LogEntry[]> | readonly LogEntry[];
}
const interpreters: readonly Interpreter[] = [
  { name: "createEffectActor + TestClock (one adjust)", run: () => effectLog(json, total, total) },
  { name: "createEffectActor + TestClock (100 ms steps)", run: () => effectLog(json, total, 100) },
  { name: "createActor + SimulatedClock", run: () => runSimulated(json, total) },
  { name: "pure systemTransition/advanceSystemTime", run: () => runPure(json, total) },
];

const reference = formatLog(runPure(json, total));
const timing: {
  name: string;
  entries: number;
  deterministic: boolean;
  equalToPure: boolean;
  coldMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}[] = [];
for (const it of interpreters) {
  const texts: string[] = [];
  const wall: number[] = [];
  let entries = 0;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const log = await it.run();
    wall.push(performance.now() - t);
    entries = log.length;
    texts.push(formatLog(log));
  }
  timing.push({
    name: it.name,
    entries,
    deterministic: texts.every((x) => x === texts[0]),
    equalToPure: texts.every((x) => x === reference),
    coldMs: r1(wall[0] ?? NaN),
    medianMs: r1(median(wall)),
    minMs: r1(Math.min(...wall)),
    maxMs: r1(Math.max(...wall)),
  });
}
console.table(timing);

const genWall: number[] = [];
for (let i = 0; i < runs; i++) {
  const t = performance.now();
  generate(ir, speech);
  genWall.push(performance.now() - t);
}
console.log(`generate IR -> MachineJSON: median ${r1(median(genWall))} ms over ${runs}; ${total} ms of story time in ${declared.scenes.length} Scenes`);

// Step sensitivity of the TestClock driver: does the size of `TestClock.adjust` change the log?
const stepRows: { stepMs: number; adjusts: number; equalToPure: boolean; wallMs: number }[] = [];
for (const stepMs of [1, 7, 100, 1000, total]) {
  const t = performance.now();
  const log = await effectLog(json, total, stepMs);
  stepRows.push({ stepMs, adjusts: Math.floor(total / stepMs) + 1, equalToPure: formatLog(log) === reference, wallMs: Math.round(performance.now() - t) });
}
console.table(stepRows);

// The virtual time of each State/Beat/Scene/cue versus what the generator declared.
const log = await effectLog(json, total, total);
const firstAt = (event: string, id: string): number | undefined => log.find((e) => e.event === event && e.id === id)?.t;
const rows: { id: string; kind: string; declaredMs: number; observedMs: number | undefined; deltaMs: number | undefined }[] = [];
const add = (id: string, kind: string, event: string, declaredMs: number): void => {
  const observedMs = firstAt(event, id);
  rows.push({ id, kind, declaredMs, observedMs, deltaMs: observedMs === undefined ? undefined : observedMs - declaredMs });
};
for (const s of declared.states) {
  add(s.id, "state.enter", "state.enter", s.enterMs);
  add(s.id, "state.leave", "state.leave", s.leaveMs);
}
for (const b of declared.beats) {
  add(b.id, "beat.start", "beat.start", b.startMs);
  add(b.id, "beat.end", "beat.end", b.endMs);
}
for (const sc of declared.scenes) {
  add(sc.id, "scene.enter", "scene.enter", sc.startMs);
  add(sc.id, "scene.leave", "scene.leave", sc.endMs);
}
const cueRows = declared.cues.map((c) => ({
  id: c.id,
  kind: `sound.start ${c.name}`,
  declaredMs: c.atMs,
  observedMs: log.find((e) => e.event === "sound.start" && e.id === c.name && e.t === c.atMs)?.t,
}));
const worst = Math.max(...rows.map((r) => Math.abs(r.deltaMs ?? Infinity)));
console.log(`state/beat/scene marks compared: ${rows.length}, missing: ${rows.filter((r) => r.observedMs === undefined).length}, max |observed - declared| = ${worst} ms`);
console.log(`sound cues: ${cueRows.length}, observed at the declared ms: ${cueRows.filter((c) => c.observedMs === c.declaredMs).length}`);
console.table(declared.states.map((s) => ({ state: s.id, declaredEnter: s.enterMs, observedEnter: firstAt("state.enter", s.id), dwellDeclaredMs: s.leaveMs - s.enterMs, dwellObservedMs: (firstAt("state.leave", s.id) ?? NaN) - (firstAt("state.enter", s.id) ?? NaN) })));

section("1c. what XState decides (tiny tests)");
const demoRows = await demos();
console.table(demoRows.map((d) => ({ feature: d.feature, pass: d.pass })));
for (const d of demoRows.filter((x) => !x.pass)) console.log("FAIL", d.feature, d.observed, "expected", d.expected);

// ---------------------------------------------------------------------------------------------------------------- 2
section("2. codec");
const codec = codecReport(ir, speech);
console.log(JSON.stringify(codec, null, 2));

// What decode reads: perturb the structure (an `after` delay) and the meta separately.
const clone = (): ReturnType<typeof encode> => JSON.parse(JSON.stringify(json)) as ReturnType<typeof encode>;
const structural = clone() as { states: { scenes: { states: { sc1: { states: { s1: { after: Record<string, unknown> } } } } } } };
const s1 = structural.states.scenes.states.sc1.states.s1;
s1.after = { 1: Object.values(s1.after)[0] };
const metaChanged = clone() as { states: { scenes: { states: { sc1: { meta: { scene: { heading: string } } } } } } };
metaChanged.states.scenes.states.sc1.meta.scene.heading = "CHANGED";
const decodeCheck = {
  decodeIgnoresStructure: JSON.stringify(decode(structural as never)) === JSON.stringify(decode(json)),
  decodeFollowsMeta: JSON.stringify(decode(metaChanged as never)) !== JSON.stringify(decode(json)),
};
console.log(decodeCheck);

// ---------------------------------------------------------------------------------------------------------------- 3
section("3. graph tooling");
const limit = 3000;
const trav = traversals(json, limit);
console.table(trav);
const elementsAtEnd = elementsAtEndOfGraphPath(json);
console.log(`element presence regions at the end of the timer-only graph path: ${elementsAtEnd}`);
const dg = directedGraph(json);
console.log(`toDirectedGraph: ${JSON.stringify(dg.report)}`);
writeFileSync("out/same-id.directed-graph.json", JSON.stringify(dg.graph));
const insp = await inspection(json, total);
console.log(`inspection event types: ${JSON.stringify(insp.types)}; @statelyai/inspect import: ${insp.statelyInspectImport}`);
writeFileSync("out/same-id.inspection.json", JSON.stringify(insp.events));

// ---------------------------------------------------------------------------------------------------------------- 5
section("5. the Video as a pure function of the frame number");
const frameReports = [24, 30, 60].map((fps) => sampleFrames(json, declared, fps));
console.table(frameReports);

// ---------------------------------------------------------------------------------------------------------------- 4
section("4. risk");
const risk: Record<string, unknown> = { installed: installed(), window: { from: windowStart, to: today } };
if (network) {
  const cx = cadence("xstate");
  const ce = cadence("@xstate/effect");
  const cs = cadence("@xstate/scxml");
  const bc = breakingChanges(cx.versions);
  risk.cadence = { xstate: cx, effect: ce, scxml: cs };
  risk.breaking = bc;
  console.log(JSON.stringify({ xstate: { ...cx, versions: cx.versions.length }, effect: { ...ce, versions: ce.versions.length } }, null, 1));
  console.log(`alphas in window with a Major Change: ${bc.alphasInWindowWithMajor} of ${bc.alphasInWindow}`);
  for (const m of bc.majorChanges) console.log(`  ${m.version}: ${m.summary}`);
}
const sz = sizes();
risk.sizes = sz;
console.log(JSON.stringify(sz, null, 1));
const ts = tsc();
risk.tsc = ts;
console.log(`tsc ${ts.version}\n--- repo flags (strict, nodenext, skipLibCheck false):\n${ts.repoFlags || "(no errors)"}\n--- + exactOptionalPropertyTypes, noUncheckedIndexedAccess:\n${ts.exactFlags.slice(0, 1500) || "(no errors)"}`);

const summary: { declared: Declared; timing: typeof timing; steps: typeof stepRows; worstDeltaMs: number; demos: typeof demoRows; codec: typeof codec; decodeCheck: typeof decodeCheck; traversals: typeof trav; elementsAtEnd: string; directedGraph: typeof dg.report; inspection: Omit<typeof insp, "events">; risk: typeof risk; frames: typeof frameReports } = {
  declared,
  timing,
  steps: stepRows,
  worstDeltaMs: worst,
  demos: demoRows,
  codec,
  decodeCheck,
  traversals: trav,
  elementsAtEnd,
  directedGraph: dg.report,
  inspection: { types: insp.types, statelyInspectImport: insp.statelyInspectImport },
  risk,
  frames: frameReports,
};
writeFileSync("results/results.json", `${JSON.stringify(summary, null, 2)}\n`);
console.log("\nwrote results/results.json");

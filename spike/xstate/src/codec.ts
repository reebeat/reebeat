// Question 2: is the generated machine data only, and is the IR recoverable from it?
//   encode(ir)  = generate(ir, speech).json  (a MachineJSON: strings, numbers, plain objects)
//   decode(json) = the IR back, from the structure (scene order = the `initial` + `xstate.done.state` chain) and the `meta`
//                  of the states (what a statechart has no field for: Elements, Lines, effects, chapters)
import { machineConfigToJSON, machineFromJSON, machineToJSON, type MachineJSON } from "xstate";
import { generate } from "./generate.ts";
import type { Ir, IrChapter, IrScene, Speech } from "./ir.ts";

type Obj = Record<string, unknown>;

export const encode = (ir: Ir, speech: ReadonlyMap<string, Speech>): MachineJSON => generate(ir, speech).json;

const asObj = (v: unknown, what: string): Obj => {
  if (typeof v !== "object" || v === null) throw new Error(`decode: ${what} is missing`);
  return v as Obj;
};

export const decode = (json: MachineJSON): Ir => {
  const story = asObj(asObj(json.meta, "root meta").story, "meta.story");
  const scenes = asObj(json.states?.scenes, "states.scenes") as unknown as { initial: string; states: Record<string, Obj> };
  const ordered: IrScene[] = [];
  let key: string | undefined = scenes.initial;
  while (key !== undefined && key !== "end") {
    const node: Obj = asObj(scenes.states[key], `scene ${key}`);
    const scene = asObj(asObj(node.meta, `meta of ${key}`).scene, `meta.scene of ${key}`) as unknown as IrScene;
    if (scene.id !== key) throw new Error(`decode: scene key ${key} carries meta of ${scene.id}`);
    ordered.push(scene);
    const done = asObj(node.on, `on of ${key}`)["xstate.done.state"] as { target?: string } | undefined;
    key = done?.target;
  }
  return {
    ...(story.author === undefined ? {} : { author: story.author as string }),
    chapters: story.chapters as IrChapter[],
    scenes: ordered,
    speed: story.speed as number,
    title: story.title as string,
    version: story.version as number,
  };
};

/** Canonical JSON: keys sorted, so two structurally equal values print equal. */
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x !== null && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );

/** Every path in a value that holds a function, a symbol, a bigint, a class instance or `undefined`: not data. */
export const nonData = (v: unknown, path = "$"): string[] => {
  if (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint" || v === undefined) return [`${path}: ${typeof v}`];
  if (v === null || typeof v !== "object") return [];
  if (Array.isArray(v)) return v.flatMap((x, i) => nonData(x, `${path}[${i}]`));
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) return [`${path}: instance of ${(v as object).constructor.name}`];
  return Object.entries(v as Obj).flatMap(([k, x]) => nonData(x, `${path}.${k}`));
};

/** Count of `@code` / `@expr` objects (inline functions serialized as source text) in a serialized definition. */
export const codeExpressions = (v: unknown): number => {
  if (v === null || typeof v !== "object") return 0;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + codeExpressions(x), 0);
  const o = v as Obj;
  return ("@code" in o || "@expr" in o ? 1 : 0) + Object.values(o).reduce<number>((n, x) => n + codeExpressions(x), 0);
};

const metaBytes = (v: unknown): number => {
  if (v === null || typeof v !== "object") return 0;
  if (Array.isArray(v)) return v.reduce<number>((n, x) => n + metaBytes(x), 0);
  return Object.entries(v as Obj).reduce<number>(
    (n, [k, x]) => n + (k === "meta" ? JSON.stringify(x).length : metaBytes(x)),
    0,
  );
};

export interface CodecReport {
  readonly jsonBytes: number;
  readonly metaBytes: number;
  readonly nonDataPaths: readonly string[];
  readonly codeExpressionsInRevived: number;
  readonly textRoundTrip: boolean;
  readonly machineRoundTrip: boolean;
  readonly irRoundTrip: boolean;
  readonly irRoundTripThroughText: boolean;
  readonly irRoundTripThroughMachine: boolean;
  readonly functionConfig: { readonly codeExpressions: number; readonly nonDataPaths: number; readonly sample: string };
}

export const codecReport = (ir: Ir, speech: ReadonlyMap<string, Speech>): CodecReport => {
  const json = encode(ir, speech);
  const text = JSON.stringify(json);
  const impls = { actions: { mark: () => undefined } };
  const revived = machineFromJSON(JSON.parse(text) as MachineJSON, impls);
  const back = machineToJSON(revived);

  // The v6 function form (what the README of @xstate/effect writes), for contrast: serialized to source text.
  const withFunctions = machineConfigToJSON({
    id: "fn",
    initial: "a",
    states: {
      a: { invoke: { src: "x", onDone: ({ event }: { event: { output: string } }) => ({ target: "b", context: { url: event.output } }) } },
      b: { entry: (_: unknown, enq: (f: () => void) => void) => enq(() => undefined) },
    },
  });
  const fnConfig = {
    id: "fn",
    states: { a: { invoke: { onDone: ({ event }: { event: { output: string } }) => ({ target: "b", context: { url: event.output } }) } } },
  };

  return {
    jsonBytes: text.length,
    metaBytes: metaBytes(json),
    nonDataPaths: nonData(json),
    codeExpressionsInRevived: codeExpressions(back),
    textRoundTrip: canonical(JSON.parse(text)) === canonical(json),
    machineRoundTrip: canonical(back) === canonical(json),
    irRoundTrip: canonical(decode(json)) === canonical(ir),
    irRoundTripThroughText: canonical(decode(JSON.parse(text) as MachineJSON)) === canonical(ir),
    irRoundTripThroughMachine: canonical(decode(back)) === canonical(ir),
    functionConfig: {
      codeExpressions: codeExpressions(withFunctions),
      nonDataPaths: nonData(fnConfig).length,
      sample: JSON.stringify(withFunctions).slice(0, 240),
    },
  };
};

// Question 3: graph tooling (`xstate/graph`, the v6 home of @xstate/graph) on the generated machine, and the Stately
// inspector. Everything here is offline.
import { createActor, machineFromJSON, SimulatedClock, type MachineJSON } from "xstate";
import { getAdjacencyMap, getShortestPaths, getSimplePaths, toDirectedGraph } from "xstate/graph";

const impl = { actions: { mark: () => undefined } };
const timed = <T>(f: () => T): { readonly value: T; readonly ms: number } => {
  const t = performance.now();
  const value = f();
  return { value, ms: Math.round((performance.now() - t) * 10) / 10 };
};

/** The scenes region alone, without the generated raises: the dwell skeleton of the story. */
export const skeleton = (json: MachineJSON): MachineJSON => {
  const copy = JSON.parse(JSON.stringify(json)) as { states: { scenes: { states: Record<string, { entry?: { type: string }[] }> } } };
  const scenes = copy.states.scenes;
  for (const sc of Object.values(scenes.states)) if (sc.entry) sc.entry = sc.entry.filter((a) => a.type === "mark");
  return { ...copy, states: { scenes } } as unknown as MachineJSON;
};


interface PathLike {
  readonly state: { readonly value: unknown };
  readonly steps: readonly unknown[];
}

export interface TraversalRow {
  readonly machine: string;
  readonly events: string;
  readonly adjacencyStates: number | "limit exceeded";
  readonly shortestPaths: number | "-";
  readonly simplePaths: number | "-";
  readonly simplePathsToEnd: number | "-";
  readonly shortestPathToEndSteps: number | "-";
  readonly ms: number;
}

const endsInEnd = (p: PathLike): boolean => (p.state.value as { scenes?: string }).scenes === "end";

const traverse = (name: string, events: string, json: MachineJSON, options: Record<string, unknown>): TraversalRow => {
  const machine = machineFromJSON(json, impl);
  const t = performance.now();
  try {
    const adjacency = Object.keys(getAdjacencyMap(machine, options as never)).length;
    const shortest = getShortestPaths(machine, options as never) as unknown as PathLike[];
    const simple = getSimplePaths(machine, options as never) as unknown as PathLike[];
    const toEnd = shortest.filter(endsInEnd);
    return {
      machine: name,
      events,
      adjacencyStates: adjacency,
      shortestPaths: shortest.length,
      simplePaths: simple.length,
      simplePathsToEnd: simple.filter(endsInEnd).length,
      shortestPathToEndSteps: Math.min(...toEnd.map((p) => p.steps.length)),
      ms: Math.round(performance.now() - t),
    };
  } catch (e) {
    if (!String(e).includes("Traversal limit exceeded")) throw e;
    return {
      machine: name,
      events,
      adjacencyStates: "limit exceeded",
      shortestPaths: "-",
      simplePaths: "-",
      simplePathsToEnd: "-",
      shortestPathToEndSteps: "-",
      ms: Math.round(performance.now() - t),
    };
  }
};

type FilterEvents = (snapshot: unknown, event: { type: string }) => boolean;
const noDone: FilterEvents = (_s, e) => e.type !== "xstate.done.state";
const onlyAfter: FilterEvents = (_s, e) => e.type === "xstate.after";

export const traversals = (json: MachineJSON, limit: number): readonly TraversalRow[] => {
  const sk = skeleton(json);
  return [
    traverse("scenes skeleton", "default (all own events)", sk, {}),
    traverse("scenes skeleton", "without xstate.done.state", sk, { filterEvents: noDone }),
    traverse("full", `default, limit ${limit}`, json, { limit }),
    traverse("full", `without xstate.done.state, limit ${limit}`, json, { filterEvents: noDone, limit }),
    traverse("full", "only xstate.after", json, { filterEvents: onlyAfter, limit }),
  ];
};

/** The element regions at the end of the single timer-only path: do the delayed raises ever fire in the graph? */
export const elementsAtEndOfGraphPath = (json: MachineJSON): string => {
  const machine = machineFromJSON(json, impl);
  const paths = getShortestPaths(machine, { filterEvents: onlyAfter, limit: 10_000 } as never) as unknown as PathLike[];
  const end = paths.find(endsInEnd);
  const value = (end?.state.value as { elements?: Record<string, { presence: string }> } | undefined)?.elements ?? {};
  const counts: Record<string, number> = {};
  for (const e of Object.values(value)) counts[e.presence] = (counts[e.presence] ?? 0) + 1;
  return JSON.stringify(counts);
};

export interface DirectedGraphReport {
  readonly nodes: number;
  readonly edges: number;
  readonly jsonBytes: number;
  readonly ms: number;
}

export const directedGraph = (json: MachineJSON): { readonly report: DirectedGraphReport; readonly graph: unknown } => {
  const machine = machineFromJSON(json, impl);
  const { value, ms } = timed(() => toDirectedGraph(machine));
  let nodes = 0;
  let edges = 0;
  const walk = (n: { children: unknown[]; edges: unknown[] }): void => {
    nodes += 1;
    edges += n.edges.length;
    for (const c of n.children) walk(c as { children: unknown[]; edges: unknown[] });
  };
  walk(value as unknown as { children: unknown[]; edges: unknown[] });
  return { report: { nodes, edges, jsonBytes: JSON.stringify(value).length, ms }, graph: value };
};

export interface InspectionReport {
  readonly types: Readonly<Record<string, number>>;
  readonly events: readonly unknown[];
  readonly statelyInspectImport: string;
}

/** The v6 inspection event stream of a full run (plain actor on a SimulatedClock), and what @statelyai/inspect does with v6. */
export const inspection = async (json: MachineJSON, totalMs: number): Promise<InspectionReport> => {
  const clock = new SimulatedClock();
  const events: { type: string; event?: { type: string }; snapshot?: { value: unknown } }[] = [];
  const machine = machineFromJSON(json, impl);
  createActor(machine, {
    clock,
    inspect: (e: unknown) => {
      const x = e as { type: string; event?: { type: string }; snapshot?: { value: unknown } };
      events.push({ type: x.type, ...(x.event ? { event: { type: x.event.type } } : {}), ...(x.snapshot ? { snapshot: { value: x.snapshot.value } } : {}) });
    },
  }).start();
  clock.increment(totalMs);
  const types: Record<string, number> = {};
  for (const e of events) types[e.type] = (types[e.type] ?? 0) + 1;

  let statelyInspectImport: string;
  try {
    // Dynamic on purpose: the import itself is the experiment (does @statelyai/inspect load against xstate v6?).
    await import("@statelyai/inspect");
    statelyInspectImport = "imported";
  } catch (e) {
    statelyInspectImport = String(e instanceof Error ? e.message : e);
  }
  return { types, events, statelyInspectImport };
};



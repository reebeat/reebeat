// Optional: feed the generated MachineJSON to Stately's own converter (github.com/statelyai/schema, not on npm).
//   git clone --depth 1 https://github.com/statelyai/schema /tmp/stately-schema && (cd /tmp/stately-schema && bun install)
//   STATELY_SCHEMA=/tmp/stately-schema bun run src/stately-check.ts
// It pins xstate 6.0.0-alpha.25, so this checks the data format, not the installed alpha.
import { generate } from "./generate.ts";
import { loadIr, loadSpeech } from "./ir.ts";

const dir = process.env.STATELY_SCHEMA;
if (dir === undefined) throw new Error("set STATELY_SCHEMA to a checkout of statelyai/schema with its dependencies installed");

// The specifier is runtime-selected (a checkout outside this package), so a static import cannot express it.
const { fromXStateConfig } = (await import(`${dir}/src/toXState.ts`)) as { fromXStateConfig: (c: unknown) => unknown };
const { convertSpecToConfig, machineToGraph } = (await import(`${dir}/src/index.ts`)) as {
  convertSpecToConfig: (s: unknown) => unknown;
  machineToGraph: (s: unknown) => { nodes: unknown[]; edges: { label?: string }[] };
};

const { json } = generate(loadIr(), loadSpeech());
const spec = fromXStateConfig(json);
const back = convertSpecToConfig(spec);
const graph = machineToGraph(spec);
const labels: Record<string, number> = {};
for (const e of graph.edges) labels[e.label ?? "?"] = (labels[e.label ?? "?"] ?? 0) + 1;
console.log(
  JSON.stringify({
    fromXStateConfig: "accepted",
    machineJsonBytes: JSON.stringify(json).length,
    specToConfigBytes: JSON.stringify(back).length,
    byteIdenticalAfterRoundTrip: JSON.stringify(back) === JSON.stringify(json),
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    edgeLabels: labels,
  }),
);

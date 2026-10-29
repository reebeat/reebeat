// Throwaway: dump the 0004 Graph IR of stories/same-id as canonical JSON (the 0004 jsonCodec), using 0004's own importer.
import { readFileSync, writeFileSync } from "node:fs";
import { Result } from "effect";
import { fountainImporter } from "../../../0004/packages/core/src/build.ts";
import { jsonCodec } from "../../../0004/packages/core/src/graph.ts";

const src = readFileSync(new URL("../../stories/same-id/story.fountain", import.meta.url), "utf8");
const graph = fountainImporter.import(src);
if (Result.isFailure(graph)) throw new Error(JSON.stringify(graph.failure));
const json = jsonCodec.encode(graph.success);
if (Result.isFailure(json)) throw new Error(String(json.failure));
writeFileSync(new URL("fixtures/same-id.graph.json", import.meta.url), json.success + "\n");
console.log(json.success.length);

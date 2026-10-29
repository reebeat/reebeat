// Throwaway: encode stories/same-id (0004 Graph IR) to SCXML, write it, decode it back, compare with the equivalence of
// GraphSchema, and print sizes.
import { readFileSync, writeFileSync } from "node:fs";
import { Result, Schema } from "effect";

import { GraphSchema, jsonCodec } from "../vendor/0004/graph.ts";
import { decodeScxml, encodeScxml } from "./codec.ts";

const dir = new URL("../fixtures/", import.meta.url);
const jsonText = readFileSync(new URL("same-id.graph.json", dir), "utf8");
const graph = Result.getOrThrow(jsonCodec.decode(jsonText));
const xml = Result.getOrThrow(encodeScxml(graph));
writeFileSync(new URL("same-id.scxml", dir), xml);
const back = Result.getOrThrow(decodeScxml(xml));
const eq = Schema.toEquivalence(GraphSchema);
console.log("round trip equal:", eq(back, graph));
console.log("json bytes", Buffer.byteLength(jsonText), "lines", jsonText.split("\n").length - 1);
console.log("scxml bytes", Buffer.byteLength(xml), "lines", xml.split("\n").length - 1);

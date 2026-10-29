// Throwaway: the generated property test of spec 0007 question 5. `Arbitrary.schema(GraphSchema)` (Effect's own)
// generates IRs; the law is `decode(encode(ir)) = ir` under `Schema.toEquivalence(GraphSchema)`.
import { describe, expect, test } from "bun:test";
import { Arbitrary, Effect, Result, Schema } from "effect";

import { GraphSchema, jsonCodec } from "../vendor/0004/graph.ts";
import type { Graph } from "../vendor/0004/graph.ts";
import { decodeScxml, encodeScxml } from "./codec.ts";
import { decodeGeneric, encodeGeneric } from "./generic.ts";

const eq = Schema.toEquivalence(GraphSchema);
const arbitrary = Arbitrary.schema(GraphSchema);
const runs = Number(process.env["RUNS"] ?? 300);

const law =
  (codec: { enc: (g: Graph) => Result.Result<string, unknown>; dec: (s: string) => Result.Result<Graph, unknown> }) =>
  (g: Graph): boolean => {
    const encoded = codec.enc(g);
    if (Result.isFailure(encoded)) return false;
    const back = codec.dec(encoded.success);
    return Result.isSuccess(back) && eq(back.success, g);
  };

const check = (property: (g: Graph) => boolean, options: { seed: number; runs: number }) =>
  Effect.runPromise(Arbitrary.checkEffect(arbitrary, property, options));

describe("IR <-> SCXML", () => {
  test("control: the JSON codec holds the law on the same generator", async () => {
    const result = await check(law({ dec: jsonCodec.decode, enc: jsonCodec.encode }), { runs, seed: 7 });
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });

  test("without the escape layer the law is falsified (XML 1.0 cannot carry every String)", async () => {
    const result = await check(
      law({ dec: (s) => decodeScxml(s, { escape: false }), enc: (g) => encodeScxml(g, { escape: false }) }),
      { runs, seed: 7 }
    );
    expect(Arbitrary.formatCheckFailure(result)).toContain("Property falsified");
  });

  test("decode(encode(ir)) = ir for generated Graphs", async () => {
    const result = await check(law({ dec: decodeScxml, enc: encodeScxml }), { runs, seed: 7 });
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });
});

describe("IR <-> generic structural XML (zero per-field mapping)", () => {
  test("decode(encode(ir)) = ir for generated Graphs", async () => {
    const result = await check(law({ dec: decodeGeneric, enc: encodeGeneric }), { runs, seed: 7 });
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
  });
});

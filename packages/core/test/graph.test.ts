// The IR (spec 0004, Revisions "the IR, and three kinds of format"): `jsonCodec` is lossless (the law
// `decode(encode(graph))` equals `graph`), closed (an excess key is a decode error) and versioned (another `version` is
// a decode error); the Plan is a function of the IR; and the three kinds of format are three different interfaces, so
// that an artifact has no `decode` and an importer no `encode`.
import { assert, describe, expectTypeOf, it } from "@effect/vitest";
import { Array as Arr, Effect, Result, String as Str } from "effect";
import type { Schema } from "effect";

import { buildPlan, fountainImporter, planOf } from "../src/build.ts";
import { jsonCodec } from "../src/graph.ts";
import type {
  ArtifactRenderer,
  Graph,
  Importer,
  IrCodec,
} from "../src/graph.ts";
import { statesSource } from "./stateStories.ts";
import { fixtureSha256, readLocal } from "./support.ts";

const sameId = readLocal("../../../stories/same-id/story.fountain");

/** A source that uses every kind of event expression, an `until`, a `let`, an offset in each unit and an absolute time. */
const everyKind = statesSource([
  'r1: show note at word("charlie").end +0.1s',
  'f1: focus box at word("foxtrot").start until first(word("hotel").start, scene.end)',
  "let settled = last(box.move.end, tag.update.50%, when(fresh.enter.progress >= 25%))",
  'let words = each(word("alpha").start, word("echo").start, throttle=0.2s, stagger=6f)',
  "x1: sound pop at settled +50%",
  "x2: sound ding at within(words, state(2)) -2f",
  "x3: sound whoosh at beat(1).start",
  'x4: sound pop at 1.5s because "the beat drops here"',
]);

const importedGraph = (source: string) =>
  Effect.fromResult(
    Result.mapError(fountainImporter.import(source), Arr.headNonEmpty)
  );

const encoded = (source: string) =>
  Effect.gen(function* encode() {
    const graph = yield* importedGraph(source);

    return { graph, text: yield* Effect.fromResult(jsonCodec.encode(graph)) };
  });

const failureOf = (decoded: Result.Result<Graph, Schema.SchemaError>) =>
  Result.isFailure(decoded) ? decoded.failure.message : undefined;

describe("the JSON codec of the IR", () => {
  it.effect("decodes what it encodes, for the Story of the journey", () =>
    Effect.gen(function* law() {
      const { graph, text } = yield* Effect.flatMap(sameId, encoded);
      const decoded = yield* Effect.fromResult(jsonCodec.decode(text));

      assert.deepStrictEqual(decoded, graph);
      assert.strictEqual(
        yield* Effect.fromResult(jsonCodec.encode(decoded)),
        text
      );
    })
  );

  it.effect(
    "decodes what it encodes, for a Story with every kind of event",
    () =>
      Effect.gen(function* law() {
        const { graph, text } = yield* encoded(everyKind);

        assert.deepStrictEqual(
          yield* Effect.fromResult(jsonCodec.decode(text)),
          graph
        );
        assert.include(text, '"kind": "within"');
        assert.include(text, '"throttle"');
        assert.include(text, '"absoluteFlicks"');
      })
  );

  it.effect(
    "refuses a key the IR does not have, at the top and inside a Scene",
    () =>
      Effect.gen(function* closed() {
        const { text } = yield* Effect.flatMap(sameId, encoded);

        assert.include(
          failureOf(
            jsonCodec.decode(Str.replace("{", '{\n  "extra": 1,')(text))
          ),
          "extra"
        );
        assert.include(
          failureOf(
            jsonCodec.decode(Str.replace('"cell":', '"zzz": 1, "cell":')(text))
          ),
          "zzz"
        );
      })
  );

  it.effect("refuses another version of the IR", () =>
    Effect.gen(function* versioned() {
      const { text } = yield* Effect.flatMap(sameId, encoded);

      assert.include(text, '"version": 1');
      assert.include(
        failureOf(
          jsonCodec.decode(Str.replace('"version": 1', '"version": 2')(text))
        ),
        "version"
      );
    })
  );

  it.effect(
    "refuses an id that does not match idPattern, and reads one that does",
    () =>
      Effect.gen(function* ids() {
        const { text } = yield* Effect.flatMap(sameId, encoded);

        const rename = (id: string) =>
          Str.replace('"id": "one"', `"id": "${id}"`)(text);

        assert.include(text, '"id": "one"');
        assert.isTrue(Result.isSuccess(jsonCodec.decode(rename("uno"))));

        for (const bad of ["1one", "-one", "one two", ""]) {
          assert.include(failureOf(jsonCodec.decode(rename(bad))), "id");
        }
      })
  );
});

describe("the Plan is a function of the IR", () => {
  it.effect(
    "is the same Plan whether the IR came from the importer or from the codec",
    () =>
      Effect.gen(function* same() {
        const source = yield* sameId;
        const { graph, text } = yield* encoded(source);
        const viaCodec = yield* Effect.fromResult(jsonCodec.decode(text));

        assert.deepStrictEqual(
          planOf(graph, fixtureSha256),
          yield* buildPlan(source, fixtureSha256)
        );
        assert.deepStrictEqual(
          planOf(viaCodec, fixtureSha256),
          planOf(graph, fixtureSha256)
        );
      })
  );
});

describe("three kinds of format, three interfaces", () => {
  it("gives a codec both directions, an importer one way in and an artifact renderer one way out", () => {
    expectTypeOf<keyof IrCodec<string>>().toEqualTypeOf<"decode" | "encode">();
    expectTypeOf<keyof Importer<string>>().toEqualTypeOf<"import">();
    expectTypeOf<keyof ArtifactRenderer<string>>().toEqualTypeOf<"render">();
    expectTypeOf<ArtifactRenderer<string>>().not.toHaveProperty("decode");
    expectTypeOf<Importer<string>>().not.toHaveProperty("encode");
    expectTypeOf(fountainImporter).toEqualTypeOf<Importer<string>>();
    expectTypeOf(jsonCodec).toEqualTypeOf<IrCodec<string>>();
  });
});

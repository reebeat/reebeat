// F10, the correct half: `buildPlan` of the fixture is deterministic and equals the golden Plan, every Element
// is listed once per Scene, the identity diff across `> AUTO-ANIMATE` is derived by #id, and `plan.json`
// decodes and encodes losslessly with a fixed key order.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record, Schema } from "effect";

import { buildPlan } from "../src/build.ts";
import { decodePlan, encodePlan } from "../src/plan.ts";
import { sha256OfText } from "../src/sha256.ts";
import { readFixture } from "./support.ts";

const fixturePlan = Effect.gen(function* plan() {
  return yield* buildPlan(yield* readFixture("boxes.fountain"));
});

describe("buildPlan of the fixture", () => {
  it.effect("is byte-identical on two runs", () =>
    Effect.gen(function* twice() {
      const source = yield* readFixture("boxes.fountain");
      const first = yield* Effect.flatMap(buildPlan(source), encodePlan);
      const second = yield* Effect.flatMap(buildPlan(source), encodePlan);

      assert.strictEqual(first, second);
    })
  );

  it.effect("equals the golden Plan", () =>
    Effect.gen(function* golden() {
      const encoded = yield* Effect.flatMap(fixturePlan, encodePlan);

      assert.strictEqual(`${encoded}\n`, yield* readFixture("boxes.plan.json"));
    })
  );

  it.effect("carries the SHA-256 of the source and no timeline", () =>
    Effect.gen(function* header() {
      const source = yield* readFixture("boxes.fountain");
      const plan = yield* buildPlan(source);

      assert.strictEqual(plan.sourceSha256, sha256OfText(source));
      assert.strictEqual(plan.schema, 1);
      assert.strictEqual(plan.title, "Boxes and ids");
      assert.strictEqual(plan.author, "Reebeat tests");
      assert.isFalse("timeline" in plan);
    })
  );

  it.effect(
    "numbers chapters, scenes, lines and cues from 1 in document order",
    () =>
      Effect.gen(function* ids() {
        const plan = yield* fixturePlan;

        assert.deepStrictEqual(
          Arr.map(plan.chapters, (chapter) => [chapter.id, chapter.sceneIds]),
          [
            ["ch1", ["sc1", "sc2"]],
            ["ch2", ["sc3", "sc4"]],
          ]
        );
        assert.deepStrictEqual(
          Arr.flatMap(plan.scenes, (scene) =>
            Arr.flatMap(scene.lines, (line) => [
              line.id,
              ...Arr.map(line.cues, (cue) => cue.id),
            ])
          ),
          [
            "sc1.l1",
            "sc1.l1.c1",
            "sc1.l2",
            "sc1.l2.c1",
            "sc1.l2.c2",
            "sc2.l1",
            "sc2.l1.c1",
            "sc2.l1.c2",
            "sc3.l1",
            "sc4.l1",
            "sc4.l1.c1",
          ]
        );
      })
  );

  it.effect(
    "turns dialogue into narration text, words and cues anchored to a word",
    () =>
      Effect.gen(function* narration() {
        const plan = yield* fixturePlan;
        const line = plan.scenes[0]?.lines[0];

        assert.strictEqual(
          line?.text,
          "This box sits in the corner. The caption says what it is."
        );
        assert.strictEqual(line?.words.length, 12);
        assert.deepStrictEqual(line?.hints, { pauseBefore: 0, speed: 0.9 });
        assert.deepStrictEqual(
          Arr.map(line?.cues ?? [], (cue) => [
            cue.kind,
            cue.arg,
            cue.afterWord,
          ]),
          [["next", null, 5]]
        );
        // `[[sfx: whoosh]] [[next]]` both follow word 3 ("place,") of sc2.l1; a cue before any word would be -1.
        assert.deepStrictEqual(
          Arr.map(plan.scenes[1]?.lines[0]?.cues ?? [], (cue) => [
            cue.kind,
            cue.arg,
            cue.afterWord,
          ]),
          [
            ["sfx", "whoosh", 3],
            ["next", null, 3],
          ]
        );
        assert.deepStrictEqual(plan.scenes[1]?.lines[0]?.hints, {
          pauseBefore: 0.5,
          speed: 1,
        });
        assert.deepStrictEqual(plan.scenes[2]?.lines[0]?.hints, {
          pauseBefore: 0,
          speed: 1.1,
        });
      })
  );
});

describe("the identity diff", () => {
  it.effect("is derived by #id across > AUTO-ANIMATE and nowhere else", () =>
    Effect.gen(function* diff() {
      const plan = yield* fixturePlan;

      assert.deepStrictEqual(
        Arr.map(plan.scenes, (scene) => [
          scene.id,
          scene.transition,
          scene.identity !== null,
        ]),
        [
          ["sc1", "default", false],
          ["sc2", "auto-animate", true],
          ["sc3", "cut", false],
          ["sc4", "auto-animate", true],
        ]
      );
      assert.deepStrictEqual(plan.scenes[1]?.identity, {
        enter: ["new"],
        exit: ["old"],
        same: ["foot"],
        update: [
          { changes: ["cell", "classes"], id: "box" },
          { changes: ["text"], id: "cap" },
        ],
      });
      assert.deepStrictEqual(plan.scenes[3]?.identity, {
        enter: [],
        exit: [],
        same: [],
        update: [{ changes: ["cell"], id: "fresh" }],
      });
    })
  );
});

describe("plan.json", () => {
  it.effect("decodes what it encodes", () =>
    Effect.gen(function* roundTrip() {
      const plan = yield* fixturePlan;
      const decoded = yield* Effect.flatMap(encodePlan(plan), decodePlan);

      assert.deepStrictEqual(decoded, plan);
    })
  );

  it.effect(
    "serialises equal Plans to equal bytes whatever the key order of the input",
    () =>
      Effect.gen(function* keyOrder() {
        const canonical = yield* Effect.flatMap(fixturePlan, encodePlan);

        const topLevel = Schema.fromJsonString(
          Schema.Record(Schema.String, Schema.Unknown)
        );

        // The same document with its top-level keys in reverse order.
        const reversed = yield* Schema.encodeEffect(topLevel)(
          Record.fromEntries(
            Arr.reverse(
              Record.toEntries(yield* Schema.decodeEffect(topLevel)(canonical))
            )
          )
        );

        assert.notStrictEqual(reversed, canonical);
        assert.strictEqual(
          yield* Effect.flatMap(decodePlan(reversed), encodePlan),
          canonical
        );
      })
  );

  it.effect(
    "rejects a Plan with a missing field or a value outside its closed set",
    () =>
      Effect.gen(function* malformed() {
        const plan = yield* fixturePlan;
        const text = yield* encodePlan(plan);

        const noScenes = yield* Effect.flip(
          decodePlan(text.replace('"scenes"', '"seen"'))
        );

        const badCell = yield* Effect.flip(
          decodePlan(text.replace('"cell": "tl"', '"cell": "xx"'))
        );

        const notJson = yield* Effect.flip(decodePlan("{"));

        assert.strictEqual(noScenes._tag, "SchemaError");
        assert.strictEqual(badCell._tag, "SchemaError");
        assert.strictEqual(notJson._tag, "SchemaError");
      })
  );
});

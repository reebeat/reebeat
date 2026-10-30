// F10, the correct half: `buildPlan` of the fixture is deterministic and equals the golden Plan, every Element
// is listed once per Scene, the identity diff across `> AUTO-ANIMATE` is derived by #id, and `plan.json`
// decodes and encodes losslessly with a fixed key order.
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Exit,
  Record,
  Schema,
  String as Str,
} from "effect";

import { buildPlan } from "../src/build.ts";
import { planLines } from "../src/lines.ts";
import { sceneIdsOfChapter } from "../src/lookup.ts";
import { decodePlan, encodePlan } from "../src/plan.ts";
import type { PlanJson } from "../src/plan.ts";
import { wordsOf } from "../src/words.ts";
import { fixtureSha256, readFixture } from "./support.ts";

const fixturePlan = Effect.gen(function* plan() {
  return yield* buildPlan(yield* readFixture("boxes.fountain"), fixtureSha256);
});

describe("buildPlan of the fixture", () => {
  it.effect("is byte-identical on two runs", () =>
    Effect.gen(function* twice() {
      const source = yield* readFixture("boxes.fountain");

      const first = yield* Effect.flatMap(
        buildPlan(source, fixtureSha256),
        encodePlan
      );

      const second = yield* Effect.flatMap(
        buildPlan(source, fixtureSha256),
        encodePlan
      );

      assert.strictEqual(first, second);
    })
  );

  it.effect("equals the golden Plan", () =>
    Effect.gen(function* golden() {
      const encoded = yield* Effect.flatMap(fixturePlan, encodePlan);

      assert.strictEqual(`${encoded}\n`, yield* readFixture("boxes.plan.json"));
    })
  );

  it.effect("copies the given hash verbatim and has no timeline", () =>
    Effect.gen(function* header() {
      const source = yield* readFixture("boxes.fountain");
      const plan = yield* buildPlan(source, "any caller-computed string");

      assert.strictEqual(plan.sourceSha256, "any caller-computed string");
      assert.strictEqual(plan.schema, 1);
      assert.strictEqual(plan.title, "Boxes and ids");
      assert.strictEqual(plan.author, "Tsukuri tests");
      assert.isFalse("timeline" in plan);
    })
  );

  it.effect(
    "numbers chapters and lines from 1 in document order and keeps the Scene ids the author wrote",
    () =>
      Effect.gen(function* ids() {
        const plan = yield* fixturePlan;

        assert.deepStrictEqual(
          Arr.map(plan.chapters, (chapter) => [
            chapter.id,
            sceneIdsOfChapter(plan, chapter.id),
          ]),
          [
            ["ch1", ["opening", "second"]],
            ["ch2", ["third", "fourth"]],
          ]
        );
        // The chapter of a Scene is stored once, on the Scene; the Chapter lists no Scenes.
        assert.deepStrictEqual(
          Arr.map(plan.chapters, (chapter) =>
            Record.keys<string, unknown>(chapter)
          ),
          [
            ["id", "line", "title", "synopsis"],
            ["id", "line", "title"],
          ]
        );
        assert.deepStrictEqual(
          Arr.map(planLines(plan), ({ id }) => id),
          ["opening.l1", "opening.l2", "second.l1", "third.l1", "fourth.l1"]
        );
      })
  );

  it.effect(
    "keeps the synopsis of a Section on its Chapter, and only there",
    () =>
      Effect.gen(function* synopsis() {
        const plan = yield* fixturePlan;

        assert.deepStrictEqual(
          Arr.map(plan.chapters, (chapter) => chapter.synopsis),
          ["One box, two screens.", undefined]
        );
        assert.isFalse("synopsis" in (plan.chapters[1] ?? {}));
      })
  );

  it.effect(
    "turns dialogue into narration text and words, byte for byte what is spoken",
    () =>
      Effect.gen(function* narration() {
        const plan = yield* fixturePlan;
        const line = plan.scenes[0]?.lines[0];

        assert.strictEqual(
          line?.text,
          "This box sits in the corner. The caption says what it is."
        );
        // The words are the text split on single spaces; the Line stores no list of them.
        assert.strictEqual(wordsOf(line?.text ?? "").length, 12);
        assert.deepStrictEqual(
          Arr.map(plan.scenes[0]?.lines ?? [], Record.keys),
          [
            ["hints", "line", "text"],
            ["hints", "line", "text"],
          ]
        );
        // (slowly) is the story default 1.1 times 0.9.
        assert.deepStrictEqual(line?.hints, { pauseBefore: 0, speed: 0.99 });
        assert.deepStrictEqual(plan.scenes[1]?.lines[0]?.hints, {
          pauseBefore: 0.5,
          speed: 1.1,
        });
        // (quickly) is the story default 1.1 times 1.1, rounded to four decimals.
        assert.deepStrictEqual(plan.scenes[2]?.lines[0]?.hints, {
          pauseBefore: 0,
          speed: 1.21,
        });
      })
  );

  it.effect(
    "keeps the Elements as written: key=value properties, visible=false for a hidden one",
    () =>
      Effect.gen(function* elements() {
        const plan = yield* fixturePlan;

        assert.deepStrictEqual(
          Arr.map(plan.scenes[0]?.elements ?? [], (element) => [
            element.id,
            element.cell,
            element.class,
            element.visible,
          ]),
          [
            ["box", "tl", "box", true],
            ["cap", "bc", "muted", false],
            ["old", "mr", "label", true],
            ["foot", "bl", "muted", true],
          ]
        );
      })
  );

  it.effect(
    "keeps each effect with its `when` as the author wrote it, in source order",
    () =>
      Effect.gen(function* effects() {
        const plan = yield* fixturePlan;

        assert.deepStrictEqual(
          Arr.map(plan.scenes[0]?.effects ?? [], (effect) => [
            effect.id,
            effect.verb,
            effect.name ?? effect.target,
            effect.when,
          ]),
          [
            [
              "r1",
              "show",
              "cap",
              {
                event: {
                  anchor: {
                    edge: "end",
                    explicit: false,
                    kind: "word",
                    occurrence: 1,
                    phrase: "corner",
                  },
                  kind: "anchor",
                },
              },
            ],
            [
              "f1",
              "focus",
              "box",
              {
                event: {
                  anchor: {
                    edge: "start",
                    explicit: true,
                    kind: "word",
                    occurrence: 2,
                    phrase: "box",
                  },
                  kind: "anchor",
                },
              },
            ],
            [
              "s1",
              "sound",
              "pop",
              {
                event: {
                  kind: "shift",
                  of: {
                    anchor: {
                      edge: "end",
                      explicit: true,
                      kind: "word",
                      occurrence: 2,
                      phrase: "box",
                    },
                    kind: "anchor",
                  },
                  offset: { unit: "flicks", value: 70_560_000 },
                },
              },
            ],
          ]
        );
        assert.deepStrictEqual(plan.scenes[3]?.effects[1]?.when, {
          absoluteFlicks: 1_058_400_000,
          reason: "the title settles on a beat in the music",
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
          ["opening", "default", false],
          ["second", "auto-animate", true],
          ["third", "cut", false],
          ["fourth", "auto-animate", true],
        ]
      );
      assert.deepStrictEqual(plan.scenes[1]?.identity, {
        enter: ["new"],
        exit: ["old"],
        same: ["foot"],
        update: [
          { changes: ["cell", "class"], id: "box" },
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

const goodAudioFile = `${Str.repeat(4)("0123456789abcdef")}.flac`;

/** The Plan of the fixture with a one-Line timeline whose audio file is `file`, decoded from its JSON text. */
const decodeWithAudioFile = (file: string) =>
  Effect.gen(function* decoded() {
    const plan = yield* fixturePlan;

    const withTimeline: PlanJson = {
      ...plan,
      timeline: {
        chapters: [],
        scenes: [
          {
            effects: [],
            endFrame: 1,
            events: [],
            lines: [
              {
                audio: { file: goodAudioFile, sha256: "x" },
                endFrame: 1,
                startFrame: 0,
                words: [],
              },
            ],
            sceneId: "opening",
            slideFrame: 0,
          },
        ],
        totalFrames: 1,
      },
    };

    const text = yield* encodePlan(withTimeline);

    const quoted = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.String)
    )(file);

    return yield* Effect.exit(
      decodePlan(Str.replace(`"${goodAudioFile}"`, quoted)(text))
    );
  });

describe("plan.json audio file names", () => {
  it.effect("accepts a cache file name: 64 hexadecimal digits and .flac", () =>
    Effect.gen(function* accepted() {
      assert.isTrue(Exit.isSuccess(yield* decodeWithAudioFile(goodAudioFile)));
    })
  );

  it.effect.each([
    ["a path separator", `sub/${Str.repeat(64)("a")}.flac`],
    ["a backslash", `sub\\${Str.repeat(64)("a")}.flac`],
    ["a parent directory", `../${Str.repeat(64)("a")}.flac`],
    ["an absolute path", `/${Str.repeat(64)("a")}.flac`],
    ["a bare parent", ".."],
    ["upper-case digits", `${Str.repeat(64)("A")}.flac`],
    ["63 digits", `${Str.repeat(63)("a")}.flac`],
    ["another extension", `${Str.repeat(64)("a")}.wav`],
    ["a trailing newline", `${Str.repeat(64)("a")}.flac\n`],
    ["an empty name", ""],
  ])("rejects %s", ([, file]) =>
    Effect.gen(function* rejected() {
      assert.isTrue(Exit.isFailure(yield* decodeWithAudioFile(file ?? "")));
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
          decodePlan(Str.replace('"scenes"', '"seen"')(text))
        );

        const badCell = yield* Effect.flip(
          decodePlan(Str.replace('"cell": "tl"', '"cell": "xx"')(text))
        );

        const notJson = yield* Effect.flip(decodePlan("{"));

        assert.strictEqual(noScenes._tag, "SchemaError");
        assert.strictEqual(badCell._tag, "SchemaError");
        assert.strictEqual(notJson._tag, "SchemaError");
      })
  );
});

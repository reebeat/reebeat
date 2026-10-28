// The schedule, with every expected frame worked out by hand (fps 30, sceneLead 1 s, lineGap 0.5 s, sceneTail
// 0.5 s; `round` is Math.round, halves up). The story has two Scenes in two Sections:
//
//   sc1.l1  (pause 0.5)  "One two three. Four five."   2000 ms, [[next]] after "three."
//   sc1.l2               "Six seven."                  1500 ms, [[sfx: pop]] after "seven."
//   sc2.l1               "Eight nine."                 1000 ms, [[sfx: whoosh]] before "Eight"
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan } from "../src/build.ts";
import type { PlanJson } from "../src/plan.ts";
import { schedule } from "../src/schedule.ts";
import type { AlignedLine } from "../src/schedule.ts";
import { asText } from "./support.ts";

const source = asText([
  "Title: Clock",
  "",
  "# Part one",
  "",
  "INT. ONE",
  "",
  "Box {#a hidden}",
  "",
  "NARRATOR",
  "(pause 0.5)",
  "One two three. [[next]] Four five.",
  "",
  "NARRATOR",
  "Six seven. [[sfx: pop]]",
  "",
  "# Part two",
  "",
  "INT. TWO",
  "",
  "NARRATOR",
  "[[sfx: whoosh]] Eight nine.",
  "",
]);

const audio = (name: string) => ({
  file: `${name}.flac`,
  sha256: `hash-${name}`,
});

const aligned: readonly AlignedLine[] = [
  {
    audio: audio("l1"),
    durationMs: 2000,
    lineId: "sc1.l1",
    words: [
      { endMs: 50, startMs: 0, w: "One" },
      { endMs: 700, startMs: 50, w: "two" },
      { endMs: 1200, startMs: 700, w: "three." },
      { endMs: 1700, startMs: 1300, w: "Four" },
      { endMs: 2000, startMs: 1700, w: "five." },
    ],
  },
  {
    audio: audio("l2"),
    durationMs: 1500,
    lineId: "sc1.l2",
    words: [
      { endMs: 600, startMs: 0, w: "Six" },
      { endMs: 1500, startMs: 600, w: "seven." },
    ],
  },
  {
    audio: audio("l3"),
    durationMs: 1000,
    lineId: "sc2.l1",
    words: [
      { endMs: 500, startMs: 100, w: "Eight" },
      { endMs: 1000, startMs: 500, w: "nine." },
    ],
  },
];

const plan = buildPlan(source);

const scheduled = Effect.flatMap(plan, (built) => schedule(built, aligned));

describe("schedule: the arithmetic, by hand", () => {
  it.effect("places Scenes, Lines and Chapters on integer frames", () =>
    Effect.gen(function* frames() {
      const { timeline } = yield* scheduled;

      // sc1 is shown at 0. l1 starts at 0 + round(30 * (1 + 0.5)) = 45 and lasts 60 f (2000 ms): ends 105.
      // l2 starts at 105 + round(30 * 0.5) = 120 and lasts 45 f: ends 165. sc1 ends at 165 + 15 = 180.
      // sc2 is shown at 180. Its line starts at 180 + 30 = 210 and lasts 30 f: ends 240. sc2 ends at 240 + 15 = 255.
      assert.deepStrictEqual(
        Arr.map(timeline?.scenes ?? [], (scene) => [
          scene.sceneId,
          scene.slideFrame,
          scene.endFrame,
        ]),
        [
          ["sc1", 0, 180],
          ["sc2", 180, 255],
        ]
      );
      assert.deepStrictEqual(
        Arr.flatMap(timeline?.scenes ?? [], (scene) =>
          Arr.map(scene.lines, (line) => [
            line.lineId,
            line.startFrame,
            line.endFrame,
          ])
        ),
        [
          ["sc1.l1", 45, 105],
          ["sc1.l2", 120, 165],
          ["sc2.l1", 210, 240],
        ]
      );
      assert.strictEqual(timeline?.totalFrames, 255);
      assert.deepStrictEqual(timeline?.chapters, [
        { chapterId: "ch1", startFrame: 0 },
        { chapterId: "ch2", startFrame: 180 },
      ]);
    })
  );

  it.effect(
    "places every word at its line start plus round(fps * ms / 1000), halves up",
    () =>
      Effect.gen(function* words() {
        const { timeline } = yield* scheduled;
        const first = timeline?.scenes[0]?.lines[0];

        // Word edges (ms -> frames at 30 fps): 0 -> 0, 50 -> 1.5 -> 2, 700 -> 21, 1200 -> 36, 1300 -> 39,
        // 1700 -> 51, 2000 -> 60; all added to the line start 45.
        assert.deepStrictEqual(
          Arr.map(first?.words ?? [], (word) => [
            word.w,
            word.startFrame,
            word.endFrame,
          ]),
          [
            ["One", 45, 47],
            ["two", 47, 66],
            ["three.", 66, 81],
            ["Four", 84, 96],
            ["five.", 96, 105],
          ]
        );
        assert.deepStrictEqual(first?.audio, audio("l1"));
      })
  );

  it.effect(
    "fires a cue at its word end: commandFrame is one earlier for next and focus, equal for sfx",
    () =>
      Effect.gen(function* cues() {
        const { timeline } = yield* scheduled;

        const cueFrames = Arr.flatMap(timeline?.scenes ?? [], (scene) =>
          Arr.flatMap(scene.lines, (line) => line.cues)
        );

        // sc1.l1.c1: [[next]] after "three." ends at 1200 ms: 45 + 36 = 81, command 80.
        // sc1.l2.c1: [[sfx: pop]] after "seven." ends at 1500 ms: 120 + 45 = 165, command 165.
        // sc2.l1.c1: [[sfx: whoosh]] before the first word fires at the line start 210, command 210.
        assert.deepStrictEqual(cueFrames, [
          { commandFrame: 80, cueId: "sc1.l1.c1", fireFrame: 81 },
          { commandFrame: 165, cueId: "sc1.l2.c1", fireFrame: 165 },
          { commandFrame: 210, cueId: "sc2.l1.c1", fireFrame: 210 },
        ]);
      })
  );

  it.effect("keeps the Plan and adds only the timeline", () =>
    Effect.gen(function* kept() {
      const built = yield* plan;
      const withTimeline = yield* scheduled;

      assert.deepStrictEqual(
        { ...withTimeline, timeline: undefined },
        { ...built, timeline: undefined }
      );
      assert.isDefined(withTimeline.timeline);
    })
  );
});

/** A scheduling failure of the Plan with one change, as the error. */
const failure = (changed: PlanJson, lines: readonly AlignedLine[]) =>
  Effect.flip(schedule(changed, lines));

/** The aligned Lines with the first one changed. */
const changeFirst = (
  change: (line: AlignedLine) => AlignedLine
): readonly AlignedLine[] =>
  Arr.map(aligned, (line, index) => (index === 0 ? change(line) : line));

describe("schedule: errors", () => {
  it.effect("AlignmentMismatch: a word count that differs", () =>
    Effect.gen(function* count() {
      const error = yield* failure(
        yield* plan,
        changeFirst((line) => ({ ...line, words: Arr.take(line.words, 4) }))
      );

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, "sc1.l1");
    })
  );

  it.effect("AlignmentMismatch: a word whose text differs", () =>
    Effect.gen(function* text() {
      const error = yield* failure(
        yield* plan,
        changeFirst((line) => ({
          ...line,
          words: Arr.map(line.words, (word) =>
            word.w === "two" ? { ...word, w: "too" } : word
          ),
        }))
      );

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, '"two"');
    })
  );

  it.effect("AlignmentMismatch: a Line with no aligned data", () =>
    Effect.gen(function* missing() {
      const error = yield* failure(yield* plan, Arr.take(aligned, 2));

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, "sc2.l1");
    })
  );

  it.effect("AlignmentMismatch: aligned data for a Line the Plan lacks", () =>
    Effect.gen(function* extra() {
      const error = yield* failure(yield* plan, [
        ...aligned,
        ...Arr.map(Arr.take(aligned, 1), (line) => ({
          ...line,
          lineId: "sc9.l1",
        })),
      ]);

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, "sc9.l1");
    })
  );

  it.effect("SceneLeadTooShort: sceneLead below the transition", () =>
    Effect.gen(function* lead() {
      const built = yield* plan;

      const error = yield* failure(
        { ...built, settings: { ...built.settings, sceneLead: 0.5 } },
        aligned
      );

      assert.strictEqual(error._tag, "SceneLeadTooShort");
    })
  );

  it.effect("CueOutsideLine: a Cue after a word the Line does not have", () =>
    Effect.gen(function* outside() {
      const built = yield* plan;

      const moved: PlanJson = {
        ...built,
        scenes: Arr.map(built.scenes, (scene, sceneIndex) =>
          sceneIndex === 0
            ? {
                ...scene,
                lines: Arr.map(scene.lines, (line) => ({
                  ...line,
                  cues: Arr.map(line.cues, (cue) => ({
                    ...cue,
                    afterWord: 99,
                  })),
                })),
              }
            : scene
        ),
      };

      const error = yield* failure(moved, aligned);

      assert.strictEqual(error._tag, "CueOutsideLine");
      assert.include(error.message, "sc1.l1.c1");
    })
  );
});

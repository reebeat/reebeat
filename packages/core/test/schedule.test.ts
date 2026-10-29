// The schedule, with every expected frame worked out by hand (fps 30, sceneLead 1 s, lineGap 0.5 s, sceneTail
// 0.5 s; `round` is Math.round, halves up; the renderer's lifecycle is `support.lifecycle`: Auto-Animate 800 ms =
// 24 frames, matched Elements start 2 frames in, unmatched Elements fade in over frames 8 to 22, `show` lasts
// round(30 * 0.133) = 4 frames). The story has two Scenes in two Sections:
//
//   one.l1  (pause 0.5)  "One two three. Four five."   2000 ms
//   one.l2               "Six seven."                  1500 ms
//   two.l1               "Eight nine."                 1000 ms
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan } from "../src/build.ts";
import { decodePlan, encodePlan } from "../src/plan.ts";
import type { PlanJson } from "../src/plan.ts";
import { schedule } from "../src/schedule.ts";
import type { AlignedLine } from "../src/schedule.ts";
import { asText, audioOf, fixtureSha256, lifecycle } from "./support.ts";

const effectLines = [
  '  r1: show late at word("three").end +100ms',
  '  s1: sound pop at word("seven").end',
  "  c1: focus m at r1.end",
];

const secondEffects = [
  "  w1: sound whoosh at transition.start",
  "  m1: sound ding at m.move.start",
  "  m2: sound pop at m.move.50%",
  "  m3: sound ding at m.move.end -2f",
  "  e1: sound pop at fresh.enter.start",
  "  t1: sound ding at transition.50%",
  "  x1: sound pop at scene.end -1f",
  '  p1: sound pop at word("nine").start +50%',
  "  k1: sound ding at w1.end +1f",
  '  a1: sound pop at 1s because "the music has its beat here"',
];

const storyWith = (first: readonly string[], second: readonly string[]) =>
  asText([
    "Title: Clock",
    "",
    "# Part one",
    "",
    "INT. ONE #one#",
    "",
    "Mover {id=m cell=ml class=box}",
    "Late {id=late cell=br class=label visible=false}",
    "",
    "[[effects",
    ...first,
    "]]",
    "",
    "NARRATOR",
    "(pause 0.5)",
    "One two three. Four five.",
    "",
    "NARRATOR",
    "Six seven.",
    "",
    "# Part two",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. TWO #two#",
    "",
    "Mover {id=m cell=mr class=accent}",
    "Fresh {id=fresh cell=tc class=title}",
    "",
    "[[effects",
    ...second,
    "]]",
    "",
    "NARRATOR",
    "Eight nine.",
    "",
  ]);

const aligned: readonly AlignedLine[] = [
  {
    audio: audioOf(1),
    durationMs: 2000,
    lineId: "one.l1",
    words: [
      { endMs: 50, startMs: 0, w: "One" },
      { endMs: 700, startMs: 50, w: "two" },
      { endMs: 1200, startMs: 700, w: "three." },
      { endMs: 1700, startMs: 1300, w: "Four" },
      { endMs: 2000, startMs: 1700, w: "five." },
    ],
  },
  {
    audio: audioOf(2),
    durationMs: 1500,
    lineId: "one.l2",
    words: [
      { endMs: 600, startMs: 0, w: "Six" },
      { endMs: 1500, startMs: 600, w: "seven." },
    ],
  },
  {
    audio: audioOf(3),
    durationMs: 1000,
    lineId: "two.l1",
    words: [
      { endMs: 500, startMs: 100, w: "Eight" },
      { endMs: 1000, startMs: 500, w: "nine." },
    ],
  },
];

const plan = buildPlan(storyWith(effectLines, secondEffects), fixtureSha256);

const scheduled = Effect.flatMap(plan, (built) =>
  schedule(built, aligned, lifecycle)
);

/** The resolved frames of the effects of one Scene: id, fire frame, command frame. */
const framesOf = (timeline: PlanJson["timeline"], sceneIndex: number) =>
  Arr.map(timeline?.scenes[sceneIndex]?.effects ?? [], (effect) => [
    effect.effectId,
    effect.fireFrame,
    effect.commandFrame,
  ]);

/** The fire frame of every effect of one Scene, by effect id. */
const firesOf = (timeline: PlanJson["timeline"], sceneIndex: number) =>
  new Map(
    Arr.map(
      timeline?.scenes[sceneIndex]?.effects ?? [],
      (effect) => [effect.effectId, effect.fireFrame] as const
    )
  );

describe("schedule: the arithmetic, by hand", () => {
  it.effect("places Scenes, Lines and Chapters on integer frames", () =>
    Effect.gen(function* frames() {
      const { timeline } = yield* scheduled;

      // one is shown at 0. l1 starts at 0 + round(30 * (1 + 0.5)) = 45 and lasts 60 f (2000 ms): ends 105.
      // l2 starts at 105 + round(30 * 0.5) = 120 and lasts 45 f: ends 165. one ends at 165 + 15 = 180.
      // two is shown at 180. Its line starts at 180 + 30 = 210 and lasts 30 f: ends 240. two ends at 240 + 15 = 255.
      assert.deepStrictEqual(
        Arr.map(timeline?.scenes ?? [], (scene) => [
          scene.sceneId,
          scene.slideFrame,
          scene.endFrame,
        ]),
        [
          ["one", 0, 180],
          ["two", 180, 255],
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
          ["one.l1", 45, 105],
          ["one.l2", 120, 165],
          ["two.l1", 210, 240],
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
        assert.deepStrictEqual(first?.audio, audioOf(1));
      })
  );
});

describe("schedule: every anchor kind, resolved by hand", () => {
  it.effect(
    "word anchors, an offset in ms and a chain from a show: fire at the frame, command one earlier for show and focus",
    () =>
      Effect.gen(function* words() {
        const { timeline } = yield* scheduled;

        // r1: show at word("three").end = 45 + 36 = 81, +100 ms = +round(3.0) = 3 frames: fire 84, command 83.
        // c1: focus at r1.end: the show window is 84 .. 84 + round(30 * 0.133) = 84 + 4 = 88: fire 88, command 87.
        // s1: sound at word("seven").end = 120 + 45 = 165: fire 165, command 165 (a sound is commanded at its fire).
        // The effects are in resolved order: 84, 88, 165.
        assert.deepStrictEqual(framesOf(timeline, 0), [
          ["r1", 84, 83],
          ["c1", 88, 87],
          ["s1", 165, 165],
        ]);
      })
  );

  it.effect(
    "transition and Element events: start, percent by time on the transition, percent by eased progress on a move",
    () =>
      Effect.gen(function* events() {
        const { timeline } = yield* scheduled;

        const by = firesOf(timeline, 1);

        // s = 180, W = 180 + round(30 * 800 / 1000) = 204.
        // w1 transition.start = 180 (command = fire: a whoosh of the slide change).
        assert.strictEqual(by.get("w1"), 180);
        // m1 m.move.start = s + matched.startLagFrames = 182.
        assert.strictEqual(by.get("m1"), 182);
        // m2 m.move.50%: the window is 182 .. 204 (22 frames). The ease cubic-bezier(0.25, 0.1, 0.25, 1) reaches
        // 50 % of the way at 29.33 % of the time (solved by hand on a fine bisection): 182 + round(0.2933 * 22) = 188.
        assert.strictEqual(by.get("m2"), 188);
        // m3 m.move.end -2f = 204 - 2 = 202.
        assert.strictEqual(by.get("m3"), 202);
        // e1 fresh.enter.start = s + unmatched.enter.startLagFrames = 188.
        assert.strictEqual(by.get("e1"), 188);
        // t1 transition.50% is linear in time: 180 + round(0.5 * 24) = 192.
        assert.strictEqual(by.get("t1"), 192);
      })
  );

  it.effect(
    "scene.end is the last frame; a percent offset is a share of the word; an effect anchor is its fire frame; an absolute time is from the slide change",
    () =>
      Effect.gen(function* rest() {
        const { timeline } = yield* scheduled;

        const by = firesOf(timeline, 1);

        // x1 scene.end -1f: the Scene ends at 255, so its last frame is 254; -1 gives 253.
        assert.strictEqual(by.get("x1"), 253);
        // p1 word("nine").start +50%: "nine." is frames 225 .. 240 (Line start 210 + 15 .. + 30); 50 % of 15 = 7.5,
        // rounded up to 8: 225 + 8 = 233.
        assert.strictEqual(by.get("p1"), 233);
        // k1 w1.end +1f: a sound has no window, so w1.end is its fire frame 180; +1 gives 181.
        assert.strictEqual(by.get("k1"), 181);
        // a1 at 1 s because ...: 180 + 30 = 210.
        assert.strictEqual(by.get("a1"), 210);
      })
  );

  it.effect(
    "lists a Scene's effects in resolved order, ties in source order, with the intent as written",
    () =>
      Effect.gen(function* order() {
        const { timeline } = yield* scheduled;

        assert.deepStrictEqual(
          Arr.map(
            timeline?.scenes[1]?.effects ?? [],
            (effect) => effect.effectId
          ),
          ["w1", "k1", "m1", "m2", "e1", "t1", "m3", "a1", "p1", "x1"]
        );
        assert.deepStrictEqual(
          Arr.map(
            Arr.filter(
              timeline?.scenes[1]?.effects ?? [],
              (effect) => effect.effectId === "m2" || effect.effectId === "p1"
            ),
            (effect) => effect.intent
          ),
          ["m.move.50%", 'word("nine").start +50%']
        );
      })
  );

  it.effect("keeps a default fade's window and a cut instant", () =>
    Effect.gen(function* windows() {
      const built = yield* buildPlan(
        asText([
          "# P",
          "",
          "INT. A #a#",
          "",
          "Box {id=b cell=mc class=box}",
          "",
          "[[effects",
          "  f1: sound pop at b.enter.end",
          "  f2: sound ding at transition.end",
          "]]",
          "",
          "NARRATOR",
          "One two.",
          "",
          "> CUT",
          "",
          "INT. B #b#",
          "",
          "Box {id=b cell=mc class=box}",
          "",
          "[[effects",
          "  g1: sound pop at b.enter.end",
          "]]",
          "",
          "NARRATOR",
          "Three four.",
          "",
        ]),
        fixtureSha256
      );

      const { timeline } = yield* schedule(
        built,
        [
          {
            audio: audioOf(1),
            durationMs: 1000,
            lineId: "a.l1",
            words: [
              { endMs: 400, startMs: 0, w: "One" },
              { endMs: 1000, startMs: 400, w: "two." },
            ],
          },
          {
            audio: audioOf(2),
            durationMs: 1000,
            lineId: "b.l1",
            words: [
              { endMs: 400, startMs: 0, w: "Three" },
              { endMs: 1000, startMs: 400, w: "four." },
            ],
          },
        ],
        lifecycle
      );

      // a is a default fade of 400 ms = 12 frames from 0: b.enter.end and transition.end are both frame 12.
      // a lasts 30 + 30 + 15 = 75 frames. b is a cut at 75: instant, so b.enter.end = 75.
      assert.deepStrictEqual(framesOf(timeline, 0), [
        ["f1", 12, 12],
        ["f2", 12, 12],
      ]);
      assert.deepStrictEqual(framesOf(timeline, 1), [["g1", 75, 75]]);
    })
  );

  it.effect("round-trips through plan.json with its timeline", () =>
    Effect.gen(function* roundTrip() {
      const withTimeline = yield* scheduled;

      const decoded = yield* Effect.flatMap(
        encodePlan(withTimeline),
        decodePlan
      );

      assert.deepStrictEqual(decoded, withTimeline);
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
const failure = (
  changed: PlanJson,
  lines: readonly AlignedLine[],
  declared = lifecycle
) => Effect.flip(schedule(changed, lines, declared));

/** The aligned Lines with the first one changed. */
const changeFirst = (
  change: (line: AlignedLine) => AlignedLine
): readonly AlignedLine[] =>
  Arr.map(aligned, (line, index) => (index === 0 ? change(line) : line));

/** Reveals `late`, which no test of an error wants to be the error. */
const showLate = '  r1: show late at word("three").end';

/** The Plan of the story with other effects in `one` and `two`. */
const planWith = (first: readonly string[], second: readonly string[]) =>
  buildPlan(storyWith(first, second), fixtureSha256);

describe("schedule: errors", () => {
  it.effect("AlignmentMismatch: a word count that differs", () =>
    Effect.gen(function* count() {
      const error = yield* failure(
        yield* plan,
        changeFirst((line) => ({ ...line, words: Arr.take(line.words, 4) }))
      );

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, "one.l1");
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
      assert.include(error.message, "two.l1");
    })
  );

  it.effect("AlignmentMismatch: aligned data for a Line the Plan lacks", () =>
    Effect.gen(function* extra() {
      const error = yield* failure(yield* plan, [
        ...aligned,
        ...Arr.map(Arr.take(aligned, 1), (line) => ({
          ...line,
          lineId: "nine.l1",
        })),
      ]);

      assert.strictEqual(error._tag, "AlignmentMismatch");
      assert.include(error.message, "nine.l1");
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

  it.effect(
    "LifecycleMismatch: a renderer whose Auto-Animate is not the Plan's transition",
    () =>
      Effect.gen(function* mismatch() {
        const error = yield* failure(yield* plan, aligned, {
          ...lifecycle,
          transitionMs: { ...lifecycle.transitionMs, "auto-animate": 500 },
        });

        assert.strictEqual(error._tag, "LifecycleMismatch");
        assert.include(error.message, "500 ms");
      })
  );

  it.effect(
    "EffectOutsideScene: an effect that resolves after its Scene, naming the effect",
    () =>
      Effect.gen(function* outside() {
        const built = yield* planWith(
          [showLate, '  s1: sound pop at word("seven").end +10s'],
          []
        );

        const error = yield* failure(built, aligned);

        // seven. ends at frame 165; +10 s = +300 frames = 465, past frame 179, the last of `one`.
        assert.strictEqual(error._tag, "EffectOutsideScene");
        assert.include(error.message, "effect s1");
        assert.include(error.message, "frame 465");
      })
  );

  it.effect(
    "EffectOutsideScene: an effect that resolves before its Scene starts, and a show whose command would precede it",
    () =>
      Effect.gen(function* before() {
        const early = yield* planWith(
          [showLate],
          ["  s1: sound pop at scene.start -3f"]
        );

        const first = yield* failure(early, aligned);

        assert.strictEqual(first._tag, "EffectOutsideScene");
        assert.include(first.message, "frame 177");

        const shown = yield* planWith(["  r1: show late at scene.start"], []);

        const second = yield* failure(shown, aligned);

        // r1 fires at frame 0, so its command (frame -1) would come before the slide change.
        assert.strictEqual(second._tag, "EffectOutsideScene");
        assert.include(second.message, "effect r1");
        assert.include(second.message, "command at -1");
      })
  );

  it.effect(
    "EmptyWindow: a percent on a window the renderer declares an instant",
    () =>
      Effect.gen(function* instant() {
        const built = yield* planWith(
          [showLate],
          ["  e1: sound pop at fresh.enter.50%"]
        );

        const error = yield* failure(built, aligned, {
          ...lifecycle,
          unmatched: { enter: { endLagFrames: 8, startLagFrames: 8 } },
        });

        assert.strictEqual(error._tag, "EmptyWindow");
        assert.include(error.message, "effect e1");
      })
  );
});

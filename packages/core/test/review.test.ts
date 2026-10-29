// The review text of `reebeat plan`: deterministic, equal to the golden text, one row per Element per Scene with
// `+ - ~` marks across auto-animate boundaries, the effects as `intent -> frame`, a summary line, the absolute
// times with their reasons and their count, and frames with `--timing` once a timeline exists.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, String as Str, pipe } from "effect";

import { buildPlan } from "../src/build.ts";
import { reviewText } from "../src/review.ts";
import { schedule } from "../src/schedule.ts";
import type { AlignedLine } from "../src/schedule.ts";
import {
  asText,
  evenlySpoken,
  fixtureSha256,
  lifecycle,
  readFixture,
} from "./support.ts";

const fixturePlan = Effect.flatMap(readFixture("boxes.fountain"), (source) =>
  buildPlan(source, fixtureSha256)
);

describe("reviewText", () => {
  it.effect("is the same text on two calls and equals the golden text", () =>
    Effect.gen(function* golden() {
      const plan = yield* fixturePlan;

      assert.strictEqual(reviewText(plan), reviewText(plan));
      assert.strictEqual(
        reviewText(plan),
        yield* readFixture("boxes.review.txt")
      );
    })
  );

  it.effect(
    "marks enter, exit and update across the auto-animate boundary and nowhere else",
    () =>
      Effect.gen(function* marks() {
        const rows = Str.split(reviewText(yield* fixturePlan), "\n");
        const marked = Arr.filter(rows, (row) => /^ {6}[-+~] /u.test(row));

        assert.deepStrictEqual(
          Arr.map(marked, (row) =>
            pipe(row, Str.trim, Str.split(/\s+/u)).slice(0, 3)
          ),
          [
            ["-", "old", "exit"],
            ["~", "box", "update"],
            ["~", "cap", "update"],
            ["+", "new", "enter"],
            ["~", "fresh", "update"],
          ]
        );
      })
  );

  it.effect("lists every Element once per Scene", () =>
    Effect.gen(function* once() {
      const plan = yield* fixturePlan;
      const text = reviewText(plan);

      for (const scene of plan.scenes) {
        const block = pipe(
          Arr.get(Str.split(text, `  Scene ${scene.id}  `), 1),
          Option.map((rest) =>
            Arr.headNonEmpty(
              Str.split(rest, /\n {2}Scene |\nChapter |\nPlan: /u)
            )
          ),
          Option.getOrElse(() => "")
        );

        const rows = Arr.filter(Str.split(block, "\n"), (row) =>
          /^ {6}[-+~ ] \S/u.test(row)
        );

        const ids = Arr.map(
          rows,
          (row) =>
            pipe(
              row,
              Str.trim,
              Str.replace(/^[-+~] /u, ""),
              Str.split(/\s+/u)
            )[0]
        );

        for (const element of scene.elements) {
          assert.strictEqual(
            Arr.filter(ids, (id) => id === element.id).length,
            1,
            `${element.id} in ${scene.id}`
          );
        }
      }
    })
  );

  it.effect(
    "lists the narration as spoken and each effect as what it does and when, as written",
    () =>
      Effect.gen(function* narration() {
        const text = reviewText(yield* fixturePlan);

        assert.include(
          text,
          '"This box sits in the corner. The caption says what it is."'
        );
        assert.include(text, "opening.l1  (speed 0.99)");
        assert.include(text, "second.l1  (pause 0.5 s)");
        assert.include(text, '      r1  show cap   word("corner").end\n');
        assert.include(
          text,
          "      s2  sound ding    box.move.50% (canonical: when(box.move.progress >= 50%))\n"
        );
        assert.include(text, "      f1  focus new     r1.end +3f\n");
      })
  );

  it.effect(
    "lists every absolute time with its reason and ends with their count",
    () =>
      Effect.gen(function* absolute() {
        const text = reviewText(yield* fixturePlan);

        assert.include(
          text,
          '  fourth s2 (line 73): at 1.5s because "the title settles on a beat in the music"\n1 absolute time\n'
        );
      })
  );

  it.effect("shows the synopsis under its Chapter", () =>
    Effect.gen(function* synopsis() {
      assert.include(
        reviewText(yield* fixturePlan),
        "Chapter ch1  The same box  (line 7)\n  Synopsis: One box, two screens.\n"
      );
    })
  );

  it.effect("ends with the summary line", () =>
    Effect.gen(function* summary() {
      assert.include(
        reviewText(yield* fixturePlan),
        "\nPlan: 4 scenes, 5 lines, 9 effects; 1 to enter, 1 to exit, 3 to update\n"
      );
    })
  );
});

const words = (...spoken: readonly string[]): AlignedLine["words"] =>
  Arr.map(spoken, (w, index) => ({
    endMs: (index + 1) * 200,
    startMs: index * 200,
    w,
  }));

/** The Plan of a one-Line story with the effects `rows`, and the same Plan with a Timeline for a Line of "One two." (1000 ms). */
const oneLine = (rows: readonly string[], elements: readonly string[] = []) =>
  Effect.gen(function* built() {
    const plan = yield* buildPlan(
      asText([
        "Title: T",
        "",
        "# S",
        "",
        "INT. A #a#",
        "",
        ...elements,
        ...(elements.length === 0 ? [] : [""]),
        "[[effects",
        ...rows,
        "]]",
        "",
        "NARRATOR",
        "One two.",
        "",
      ]),
      fixtureSha256
    );

    const withTimeline = yield* schedule(
      plan,
      [
        {
          audio: { file: `${Str.repeat(64)("a")}.flac`, sha256: "x" },
          durationMs: 1000,
          lineId: "a.l1",
          words: words("One", "two."),
        },
      ],
      lifecycle
    );

    return { plan, withTimeline };
  });

describe("reviewText with timing", () => {
  it.effect("says there is no timeline before schedule", () =>
    Effect.gen(function* none() {
      assert.include(
        reviewText(yield* fixturePlan, { timing: true }),
        "Timeline: none yet"
      );
    })
  );

  it.effect("adds frames and the total once a timeline exists", () =>
    Effect.gen(function* timed() {
      const { withTimeline } = yield* oneLine([
        '  s1: sound pop at word("two").end',
      ]);

      const text = reviewText(withTimeline, { timing: true });

      // The line starts at round(30 * 1) = 30 and lasts 30 frames; the Scene ends 15 frames later.
      assert.include(
        text,
        "slide change at frame 0, frames 0-75 (0.00-2.50 s)"
      );
      assert.include(text, "frames 30-60 (1.00-2.00 s)");
      assert.include(text, 'word("two").end  ->  frame 42 (1.40 s)');
      assert.include(text, "Timeline: 75 frames, 2.50 s at 30 fps");
      assert.notInclude(reviewText(withTimeline), "frames 30-60");
      assert.notInclude(reviewText(withTimeline), "->  frame");
    })
  );

  it.effect(
    "says where the Deck plays each sound: on the slide, on a step, or alone; a step has no carrier",
    () =>
      Effect.gen(function* carriers() {
        const { withTimeline } = yield* oneLine(
          [
            '  r1: show note at word("two").end',
            "  s1: sound whoosh at transition.start",
            "  s2: sound ding at r1.start",
            '  s3: sound pop at word("one").start',
          ],
          ["Note {id=note cell=br class=label visible=false}"]
        );

        const rows = Arr.filter(
          Str.split(reviewText(withTimeline, { timing: true }), "\n"),
          (row) => /^ {6}[rs]\d {2}/u.test(row)
        );

        assert.deepStrictEqual(rows, [
          '      r1  show note     word("two").end  ->  frame 42 (1.40 s)',
          "      s1  sound whoosh  transition.start  ->  frame 0 (0.00 s)  (rides the slide)",
          "      s2  sound ding    r1.start  ->  frame 42 (1.40 s)  (rides step r1)",
          '      s3  sound pop     word("one").start  ->  frame 30 (1.00 s)  (plays alone)',
        ]);
      })
  );

  it.effect(
    "shows an effect anchored to the transition start as intent and, with a timeline, its frame",
    () =>
      Effect.gen(function* anchored() {
        const { plan, withTimeline } = yield* oneLine([
          "  s1: sound whoosh at transition.start",
        ]);

        assert.include(
          reviewText(plan),
          "      s1  sound whoosh  transition.start\n"
        );
        assert.include(
          reviewText(withTimeline, { timing: true }),
          "      s1  sound whoosh  transition.start  ->  frame 0 (0.00 s)  (rides the slide)\n"
        );
      })
  );

  it.effect("lists each absolute time with its reason and counts them", () =>
    Effect.gen(function* absolute() {
      const { plan } = yield* oneLine([
        '  s1: sound pop at 0.5s because "the drum hits here"',
        '  s2: sound ding at 1s because "and again"',
      ]);

      const text = reviewText(plan);

      assert.include(
        text,
        '  a s1 (line 8): at 0.5s because "the drum hits here"\n'
      );
      assert.include(text, '  a s2 (line 9): at 1s because "and again"\n');
      assert.include(text, "\n2 absolute times\n");
    })
  );
});

/** A story with every kind of timing: a derived event, a threshold (written as sugar), an offset, an each, a show, a focus with an until, a focus the slide change interrupts, an absolute time. */
const timingStory = (fourth: string) =>
  asText([
    "Title: Timing",
    "",
    "# Part",
    "",
    "INT. A #a#",
    "",
    "Box {id=one cell=ml class=box}",
    "Tag {id=tag cell=tc class=label}",
    "",
    "NARRATOR",
    "Hello there.",
    "",
    "> AUTO-ANIMATE",
    "",
    "INT. B #b#",
    "",
    "Box {id=one cell=mc class=box}",
    "Tag {id=tag cell=tc class=accent}",
    "Hint {id=hint cell=bc class=muted}",
    "Note {id=note cell=br class=label visible=false}",
    "",
    "[[effects",
    "  let settled = all(one.move.end, tag.update.end)",
    "  s1: sound whoosh at transition.start",
    "  s2: sound ding at one.move.50%",
    "  s3: sound pop at settled +0.1s",
    `  s4: sound pop at each(word("two").end, word("${fourth}").end)`,
    '  r1: show note at word("three").end',
    '  f1: focus hint at word("one").start until word("four").start',
    '  f2: focus one at word("six").end',
    '  s5: sound pop at 0.5s because "a beat"',
    "]]",
    "",
    "NARRATOR",
    "One two three four five six seven.",
    "",
  ]);

/** The rows of Scene `b` from its derived events to its Lines. */
const sceneBEffects = (text: string): readonly string[] => {
  const rows = Str.split(text, "\n");
  const from = rows.indexOf("    Events");

  return Arr.take(Arr.drop(rows, from), rows.indexOf("    Lines", from) - from);
};

describe("reviewText of the timing of a story (F9)", () => {
  it.effect(
    "prints each instance's intent, its frame and its time, the canonical form beside the written one, what ended a window, and the derived events with their frames",
    () =>
      Effect.gen(function* golden() {
        const plan = yield* buildPlan(timingStory("four"), fixtureSha256);
        const timed = yield* schedule(plan, evenlySpoken(plan, 300), lifecycle);

        // 300 ms a word at 30 fps: Scene b's slide change is at frame 63, its Line starts at 93 and word n ends at 93 + 9 n;
        // the move of `one` runs from the slide change for 24 frames, so `settled` is frame 87 and `+0.1s` is 3 frames.
        assert.deepStrictEqual(
          sceneBEffects(reviewText(timed, { timing: true })),
          [
            "    Events",
            "      settled  all(one.move.end, tag.update.end)  ->  frame 87 (2.90 s)",
            "    Effects",
            "      s1    sound whoosh  transition.start  ->  frame 63 (2.10 s)  (rides the slide)",
            "      s2    sound ding    one.move.50% (canonical: when(one.move.progress >= 50%))  ->  frame 71 (2.37 s)  (rides the slide)",
            "      s3    sound pop     settled +0.1s (canonical: settled +100ms)  ->  frame 90 (3.00 s)  (rides the slide)",
            '      s4#1  sound pop     each(word("two").end, word("four").end)  ->  frame 111 (3.70 s)  (rides step f1)',
            '      s4#2  sound pop     each(word("two").end, word("four").end)  ->  frame 129 (4.30 s)  (rides step r1)',
            '      r1    show note     word("three").end  ->  frame 120 (4.00 s)',
            "        ends frame 124 (4.13 s), by its window",
            '      f1    focus hint    word("one").start until word("four").start  ->  frame 93 (3.10 s)',
            "        ends frame 120 (4.00 s), by until",
            '      f2    focus one     word("six").end  ->  frame 147 (4.90 s)',
            "        ends frame 170 (5.67 s), interrupted by the slide change",
            '      s5    sound pop     0.5s because "a beat"  ->  frame 78 (2.60 s)  (plays alone)',
          ]
        );

        // The absolute time is still listed, with its reason, and counted.
        assert.include(
          reviewText(timed, { timing: true }),
          '  b s5 (line 31): at 0.5s because "a beat"\n1 absolute time\n'
        );
      })
  );

  it.effect(
    "without the Timeline prints the intent only: the same rows with no frame, no end and no instance",
    () =>
      Effect.gen(function* intent() {
        const plan = yield* buildPlan(timingStory("four"), fixtureSha256);

        assert.deepStrictEqual(sceneBEffects(reviewText(plan)), [
          "    Events",
          "      settled  all(one.move.end, tag.update.end)",
          "    Effects",
          "      s1  sound whoosh  transition.start",
          "      s2  sound ding    one.move.50% (canonical: when(one.move.progress >= 50%))",
          "      s3  sound pop     settled +0.1s (canonical: settled +100ms)",
          '      s4  sound pop     each(word("two").end, word("four").end)',
          '      r1  show note     word("three").end',
          '      f1  focus hint    word("one").start until word("four").start',
          '      f2  focus one     word("six").end',
          '      s5  sound pop     0.5s because "a beat"',
        ]);
      })
  );

  it.effect(
    "negative control: editing one word of the story changes the text",
    () =>
      Effect.gen(function* edited() {
        const first = yield* buildPlan(timingStory("four"), fixtureSha256);
        const second = yield* buildPlan(timingStory("five"), fixtureSha256);

        const timed = (plan: typeof first) =>
          Effect.map(
            schedule(plan, evenlySpoken(plan, 300), lifecycle),
            (scheduled) => reviewText(scheduled, { timing: true })
          );

        assert.notStrictEqual(yield* timed(first), yield* timed(second));
      })
  );
});

describe("the time printed beside a frame is at the Plan's rate", () => {
  it.effect(
    "is frames over fps, over the NTSC fraction when the Plan is NTSC",
    () =>
      Effect.gen(function* rates() {
        const { withTimeline } = yield* oneLine([
          '  s1: sound pop at word("two").end',
        ]);

        const totalOf = (settings: Partial<typeof withTimeline.settings>) =>
          Arr.findFirst(
            Str.split(
              reviewText(
                {
                  ...withTimeline,
                  settings: { ...withTimeline.settings, ...settings },
                  timeline: {
                    chapters: withTimeline.timeline?.chapters ?? [],
                    scenes: withTimeline.timeline?.scenes ?? [],
                    totalFrames: 3000,
                  },
                },
                { timing: true }
              ),
              "\n"
            ),
            Str.startsWith("Timeline:")
          );

        assert.deepStrictEqual(
          totalOf({ fps: 30, ntsc: false }),
          Option.some("Timeline: 3000 frames, 100.00 s at 30 fps")
        );
        assert.deepStrictEqual(
          totalOf({ fps: 30, ntsc: true }),
          Option.some("Timeline: 3000 frames, 100.10 s at 30 NTSC fps")
        );
        assert.deepStrictEqual(
          totalOf({ fps: 60, ntsc: false }),
          Option.some("Timeline: 3000 frames, 50.00 s at 60 fps")
        );
      })
  );
});

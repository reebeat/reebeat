// The review text of `reebeat plan`: deterministic, equal to the golden text, one row per Element per Scene with
// `+ - ~` marks across auto-animate boundaries, the effects as `intent -> frame`, a summary line, the absolute
// times with their reasons and their count, and frames with `--timing` once a timeline exists.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan } from "../src/build.ts";
import { reviewText } from "../src/review.ts";
import { schedule } from "../src/schedule.ts";
import type { AlignedLine } from "../src/schedule.ts";
import { asText, fixtureSha256, lifecycle, readFixture } from "./support.ts";

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
        const rows = reviewText(yield* fixturePlan).split("\n");
        const marked = Arr.filter(rows, (row) => /^ {6}[-+~] /u.test(row));

        assert.deepStrictEqual(
          Arr.map(marked, (row) => row.trim().split(/\s+/u).slice(0, 3)),
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
        const block =
          text
            .split(`  Scene ${scene.id}  `)[1]
            ?.split(/\n {2}Scene |\nChapter |\nPlan: /u)[0] ?? "";

        const rows = Arr.filter(block.split("\n"), (row) =>
          /^ {6}[-+~ ] \S/u.test(row)
        );

        const ids = Arr.map(
          rows,
          (row) =>
            row
              .trim()
              .replace(/^[-+~] /u, "")
              .split(/\s+/u)[0]
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
        assert.include(text, "first.l1  (speed 0.99)");
        assert.include(text, "second.l1  (pause 0.5 s)");
        assert.include(text, '      r1  show cap   word("corner").end\n');
        assert.include(text, "      s2  sound ding    box.move.50%\n");
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
          audio: { file: `${"a".repeat(64)}.flac`, sha256: "x" },
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
      assert.include(text, 'word("two").end  ->  frame 42');
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
          reviewText(withTimeline, { timing: true }).split("\n"),
          (row) => /^ {6}[rs]\d {2}/u.test(row)
        );

        assert.deepStrictEqual(rows, [
          '      r1  show note     word("two").end  ->  frame 42',
          "      s1  sound whoosh  transition.start  ->  frame 0  (rides the slide)",
          "      s2  sound ding    r1.start  ->  frame 42  (rides step r1)",
          '      s3  sound pop     word("one").start  ->  frame 30  (plays alone)',
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
          "      s1  sound whoosh  transition.start  ->  frame 0  (rides the slide)\n"
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

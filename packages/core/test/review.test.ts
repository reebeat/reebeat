// The review text of `reebeat plan`: deterministic, equal to the golden text, one row per Element per Scene with
// `+ - ~` marks across auto-animate boundaries, the Cue markers written back into the narration, a summary
// line, and frames with `--timing` once a timeline exists.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, String as Str, pipe } from "effect";

import { buildPlan } from "../src/build.ts";
import { reviewText } from "../src/review.ts";
import { schedule } from "../src/schedule.ts";
import type { AlignedLine } from "../src/schedule.ts";
import { asText, fixtureSha256, readFixture } from "./support.ts";

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
    "writes the Cues back into the narration after the word they follow",
    () =>
      Effect.gen(function* narration() {
        const text = reviewText(yield* fixturePlan);

        assert.include(
          text,
          '"This box sits in the corner. [[next]] The caption says what it is."'
        );
        assert.include(
          text,
          '"Same id, new place. [[sfx: whoosh]] [[next]] A new element enters."'
        );
        assert.include(text, "sc1.l1  (speed 0.99)");
        assert.include(text, "sc2.l1  (pause 0.5 s)");
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
        "\nPlan: 4 scenes, 5 lines, 6 cues; 1 to enter, 1 to exit, 3 to update\n"
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

/** The Plan of a one-Line story with `dialogue`, and the same Plan with a Timeline for a Line of "One two." (1000 ms). */
const oneLine = (dialogue: string) =>
  Effect.gen(function* built() {
    const plan = yield* buildPlan(
      asText([
        "Title: T",
        "",
        "# S",
        "",
        "INT. A",
        "",
        "NARRATOR",
        dialogue,
        "",
      ]),
      fixtureSha256
    );

    const withTimeline = yield* schedule(plan, [
      {
        audio: { file: `${Str.repeat(64)("a")}.flac`, sha256: "x" },
        durationMs: 1000,
        lineId: "sc1.l1",
        words: words("One", "two."),
      },
    ]);

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
      const { withTimeline } = yield* oneLine("One two. [[sfx: pop]]");

      const text = reviewText(withTimeline, { timing: true });

      // The line starts at round(30 * 1) = 30 and lasts 30 frames; the Scene ends 15 frames later.
      assert.include(
        text,
        "slide change at frame 0, frames 0-75 (0.00-2.50 s)"
      );
      assert.include(text, "frames 30-60 (1.00-2.00 s)");
      assert.include(text, "cue sc1.l1.c1 fires at frame 42, command at 42");
      assert.include(text, "Timeline: 75 frames, 2.50 s at 30 fps");
      assert.notInclude(reviewText(withTimeline), "frames 30-60");
    })
  );

  it.effect(
    "shows an sfx anchored to the transition start with its frame",
    () =>
      Effect.gen(function* anchored() {
        const { plan, withTimeline } = yield* oneLine(
          "[[sfx: whoosh]] One two."
        );

        assert.include(
          reviewText(plan),
          "cue sc1.l1.c1 sfx whoosh  anchored to transition.start"
        );
        assert.include(
          reviewText(withTimeline, { timing: true }),
          "cue sc1.l1.c1 sfx whoosh  transition.start -> frame 0, command at 0"
        );
      })
  );
});

// How an offset and an occurrence become a frame, worked out by hand (fps 30; `round` is Math.round: halves round
// UP, toward +infinity, so -1.5 is -1). One Line of six words, 300 ms (9 frames) each: `Box one box two box three.`
// Relative to the Line's first frame `L`, word k (from 0) spans L + 9k .. L + 9k + 9, so `word("three").end` is L + 54
// and the phrase `box` stands at L + 0, L + 18 and L + 36.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Result } from "effect";

import { buildPlan } from "../src/build.ts";
import { parseEffectLine } from "../src/effects.ts";
import { schedule } from "../src/schedule.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

/** What reading one effect line gives: `tag (line n): message`, or `parsed`. */
const text = (line: string) => {
  const read = parseEffectLine(line, 7);

  return Result.isFailure(read)
    ? `${read.failure._tag} (line ${read.failure.line}): ${read.failure.message}`
    : "parsed";
};

const scheduledWith = (effects: readonly string[]) =>
  Effect.gen(function* scheduledStory() {
    const built = yield* buildPlan(
      asText([
        "# P",
        "",
        "INT. A #a#",
        "",
        "Box {id=b cell=mc class=box}",
        "",
        "[[effects",
        ...effects,
        "]]",
        "",
        "NARRATOR",
        "Box one box two box three.",
        "",
      ]),
      fixtureSha256
    );

    const { timeline } = yield* schedule(
      built,
      evenlySpoken(built, 300),
      lifecycle
    );

    const scene = timeline?.scenes[0];
    const first = scene?.lines[0]?.words[0]?.startFrame ?? -1;

    return {
      /** The frame of an effect relative to the Line's first frame. */
      at: (id: string): number | undefined =>
        Option.getOrUndefined(
          Option.map(
            Arr.findFirst(
              scene?.effects ?? [],
              (effect) => effect.effectId === id
            ),
            (found) => found.fireFrame - first
          )
        ),
    };
  });

describe("an offset in each unit, resolved to a frame", () => {
  it.effect(
    "seconds, milliseconds, frames and percents land on the hand-computed frame, halves up",
    () =>
      Effect.gen(function* units() {
        const { at } = yield* scheduledWith([
          '  a: sound pop at word("three").end +0.1s',
          '  b: sound pop at word("three").end +100ms',
          '  c: sound pop at word("three").end +3f',
          '  d: sound pop at word("three").end +50ms',
          '  e: sound pop at word("three").end -50ms',
          '  f: sound pop at word("three").end +50%',
          '  g: sound pop at word("three").end -50%',
          '  h: sound pop at word("three").end +12.5%',
        ]);

        // 0.1 s = 100 ms = 3.0 frames: the written unit does not change the frame.
        assert.strictEqual(at("a"), 57);
        assert.strictEqual(at("b"), 57);
        assert.strictEqual(at("c"), 57);
        // 50 ms = 1.5 frames: up to 2. -50 ms = -1.5 frames: half up is toward +infinity, -1.
        assert.strictEqual(at("d"), 56);
        assert.strictEqual(at("e"), 53);
        // The word is 9 frames wide: 50 % = 4.5 up to 5; -50 % = -4.5 up to -4; 12.5 % = 1.125 down to 1.
        assert.strictEqual(at("f"), 59);
        assert.strictEqual(at("g"), 50);
        assert.strictEqual(at("h"), 55);
      })
  );

  it("refuses a fraction of a frame and suggests the whole form the schedule would round to (the signed value, halves toward +infinity)", () => {
    const hint = (offset: string): string => {
      const found = text(`a: sound pop at word("x").end ${offset}`);

      return found.slice(found.lastIndexOf("did you mean ") + 13, -1);
    };

    assert.strictEqual(
      text('a: sound pop at word("x").end +1.5f'),
      'BadEffect (line 7): frame offset "+1.5f" is not a whole number of frames; expected +Nf with an integer N, as +2f (seconds, milliseconds and percents may be decimal); did you mean +2f?'
    );

    // -1.5 frames is -1 for the schedule (see `-50ms` above): the hint must not say -2f.
    assert.deepStrictEqual(
      Arr.map(
        ["+1.5f", "-1.5f", "+2.5f", "-2.5f", "+0.4f", "-0.4f", "-1.6f"],
        hint
      ),
      ["+2f", "-1f", "+3f", "-2f", "+0f", "+0f", "-2f"]
    );

    for (const accepted of ["+0.1s", "+100ms", "+12.5%", "+2f", "+2.0f"]) {
      assert.strictEqual(
        text(`a: sound pop at word("x").end ${accepted}`),
        "parsed",
        accepted
      );
    }
  });
});

describe("word(phrase, n), resolved to the nth occurrence", () => {
  it.effect("puts each occurrence on its own frames", () =>
    Effect.gen(function* occurrences() {
      const { at } = yield* scheduledWith([
        '  a: sound pop at word("box", 1).start',
        '  b: sound pop at word("box", 2).start',
        '  c: sound pop at word("box", 3).end',
      ]);

      assert.strictEqual(at("a"), 0);
      // The second `box` is the third word: it starts at L + 18, not at the first occurrence's L + 0.
      assert.strictEqual(at("b"), 18);
      assert.strictEqual(at("c"), 45);
    })
  );
});

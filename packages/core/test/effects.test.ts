// The effects line (spec 0002): each form reads into the Plan's types, and what is written back reads into the same
// effect (the law: `parseEffectLine(formatEffect(effect))` is `effect`, with seconds stored as milliseconds).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Order, Result } from "effect";

import { buildPlan } from "../src/build.ts";
import { formatAnchor, formatEffect, parseEffectLine } from "../src/effects.ts";
import type { Effect as PlanEffect } from "../src/plan.ts";
import { reviewText } from "../src/review.ts";
import { schedule } from "../src/schedule.ts";
import { asText, evenlySpoken, fixtureSha256, lifecycle } from "./support.ts";

const read = (text: string): PlanEffect => {
  const parsed = parseEffectLine(text, 3);

  if (Result.isFailure(parsed)) {
    assert.fail(`${text}: ${parsed.failure.message}`);
  }

  return parsed.success.effect;
};

const failure = (text: string) => {
  const parsed = parseEffectLine(text, 3);

  return Result.isFailure(parsed) ? parsed.failure : undefined;
};

describe("reading an effect line", () => {
  it("reads a sound at a word of the narration, with the occurrence and an offset in seconds", () => {
    assert.deepStrictEqual(
      read('s1: sound ding at word("big idea", 2).end +0.1s'),
      {
        id: "s1",
        line: 3,
        name: "ding",
        verb: "sound",
        when: {
          anchor: {
            edge: "end",
            kind: "word",
            occurrence: 2,
            phrase: "big idea",
          },
          offset: { unit: "ms", value: 100 },
        },
        written: 'word("big idea", 2).end +0.1s',
      }
    );
  });

  it("reads every anchor kind", () => {
    const anchors = Arr.map(
      [
        'a: sound pop at word("x").start',
        "a: sound pop at scene.end",
        "a: sound pop at transition.50%",
        "a: sound pop at box.update.end",
        "a: sound pop at b.start",
      ],
      (text) => {
        const { when } = read(text);

        return "anchor" in when ? when.anchor : undefined;
      }
    );

    assert.deepStrictEqual(anchors, [
      { edge: "start", kind: "word", occurrence: 1, phrase: "x" },
      { edge: "end", kind: "scene" },
      { at: { percent: 50 }, kind: "transition" },
      { at: "end", event: "update", id: "box", kind: "element" },
      { edge: "start", id: "b", kind: "effect" },
    ]);
  });

  it("reads an offset in each unit with its sign: seconds and milliseconds as milliseconds, frames, a percent", () => {
    const offsets = Arr.map(
      ["+0.1s", "-0.2s", "+250ms", "-3f", "+50%", "-12.5%", "+1.5s"],
      (offset) => {
        const { when } = read(`a: sound pop at scene.start ${offset}`);

        return "anchor" in when ? when.offset : undefined;
      }
    );

    assert.deepStrictEqual(offsets, [
      { unit: "ms", value: 100 },
      { unit: "ms", value: -200 },
      { unit: "ms", value: 250 },
      { unit: "f", value: -3 },
      { unit: "percent", value: 50 },
      { unit: "percent", value: -12.5 },
      { unit: "ms", value: 1500 },
    ]);
  });

  it("reads an absolute time with its reason, in milliseconds", () => {
    assert.deepStrictEqual(
      read('a: sound pop at 12.5s because "the beat   drops here"').when,
      { absoluteMs: 12_500, reason: "the beat drops here" }
    );
  });

  it("marks whether a phrase wrote its occurrence", () => {
    const written = parseEffectLine('a: sound pop at word("x", 1).end', 3);
    const left = parseEffectLine('a: sound pop at word("x").end', 3);

    assert.isTrue(
      Result.isSuccess(written) && written.success.explicitOccurrence
    );
    assert.isTrue(Result.isSuccess(left) && !left.success.explicitOccurrence);
  });

  it("refuses a percent above 100, an occurrence of 0 and a phrase of nothing", () => {
    assert.strictEqual(
      failure("a: sound pop at transition.101%")?._tag,
      "BadPercent"
    );
    assert.strictEqual(
      failure('a: sound pop at word("x", 0).end')?._tag,
      "BadEffect"
    );
    assert.strictEqual(
      failure('a: sound pop at word("").end')?._tag,
      "BadEffect"
    );
    assert.strictEqual(failure("a: sound pop at scene.50%")?._tag, "BadEffect");
  });
});

describe("writing an effect line", () => {
  const lines = [
    's1: sound whoosh at word("matches").end +100ms',
    's5: sound whoosh at word("matches", 1).end +0.1s',
    "s2: sound ding at one.move.50%",
    'f1: focus hint at word("slides", 2).start -200ms',
    'f2: focus hint at word("slides", 2).start -0.2s',
    "r1: show note at transition.end -3f",
    "s3: sound pop at r1.end +50%",
    'a1: sound pop at 12.5s because "a reason"',
    "s4: sound pop at scene.end",
  ];

  it("reads back what it writes, effect for effect", () => {
    for (const line of lines) {
      const effect = read(line);

      assert.deepStrictEqual(read(formatEffect(effect)), effect, line);
    }
  });

  it("writes the author's own form: the occurrence and the unit stay as written", () => {
    assert.deepStrictEqual(
      Arr.map(lines, (line) => formatEffect(read(line))),
      lines
    );
  });

  it("keeps the `when` as written, whitespace collapsed", () => {
    assert.strictEqual(
      read('a: sound pop at   word("x  y", 2).end   -3f').written,
      'word("x y", 2).end -3f'
    );
  });

  it("writes an anchor on its own", () => {
    const { when } = read('a: sound pop at word("x y", 2).end -3f');

    assert.strictEqual(
      "anchor" in when ? formatAnchor(when.anchor) : "",
      'word("x y", 2).end'
    );
  });
});

const storyOf = (block: readonly string[]) =>
  asText([
    "# P",
    "",
    "INT. A #a#",
    "",
    "Box {id=b cell=mc class=box}",
    "Note {id=note cell=br class=label visible=false}",
    "",
    "[[effects",
    ...block,
    "]]",
    "",
    "NARRATOR",
    "Box one two three four five six seven eight nine ten.",
    "",
  ]);

describe("an effect line through a whole story", () => {
  const effects = [
    '  r1: show note at word("box", 1).end +0.1s',
    '  s1: sound pop at word("box", 1).end +100ms',
    '  s2: sound pop at word("box", 1).end +3f',
    '  s3: sound pop at word("box", 1).end -0.05s',
    '  s4: sound pop at word("box", 1).end +50%',
    "  s5: sound pop at r1.start -10%",
    '  s6: sound pop at 0.5s because "a beat"',
  ];

  it.effect(
    "writing every effect back gives the same Plan, the same intent and the same review text",
    () =>
      Effect.gen(function* storyLevel() {
        const first = yield* buildPlan(storyOf(effects), fixtureSha256);

        const rewritten = Arr.map(
          first.scenes[0]?.effects ?? [],
          (effect) => `  ${formatEffect(effect)}`
        );

        assert.deepStrictEqual(rewritten, effects);

        const second = yield* buildPlan(storyOf(rewritten), fixtureSha256);

        assert.deepStrictEqual(second, first);
        assert.strictEqual(reviewText(second), reviewText(first));

        const timed = yield* schedule(
          first,
          evenlySpoken(first, 300),
          lifecycle
        );

        // The Timeline's intent is what was written: the explicit occurrence 1, `+0.1s` and `+100ms` as they stand.
        assert.deepStrictEqual(
          Arr.sort(
            Arr.map(
              timed.timeline?.scenes[0]?.effects ?? [],
              (timedEffect) => timedEffect.intent
            ),
            Order.String
          ),
          Arr.sort(
            Arr.map(effects, (row) => row.trim().split(" at ")[1] ?? ""),
            Order.String
          )
        );
        assert.include(reviewText(first), 'word("box", 1).end +0.1s');
        assert.include(reviewText(first), 'word("box", 1).end +100ms');
      })
  );
});

// The effects line (spec 0002): each form reads into the Plan's types, and what is written back reads into the same
// effect (the law: `parseEffectLine(formatEffect(effect))` is `effect`, with seconds stored as milliseconds).
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Result } from "effect";

import {
  formatAnchor,
  formatEffect,
  formatOffset,
  formatWhen,
  parseEffectLine,
} from "../src/effects.ts";
import type { Effect } from "../src/plan.ts";

const read = (text: string): Effect => {
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
    "s2: sound ding at one.move.50%",
    'f1: focus hint at word("slides", 2).start -200ms',
    "r1: show note at transition.end -3f",
    "s3: sound pop at s2.end +50%",
    'a1: sound pop at 12.5s because "a reason"',
    "s4: sound pop at scene.end",
  ];

  it("reads back what it writes, effect for effect", () => {
    for (const line of lines) {
      const effect = read(line);

      assert.deepStrictEqual(read(formatEffect(effect)), effect, line);
    }
  });

  it("writes the author's own form for lines already in it", () => {
    assert.deepStrictEqual(
      Arr.map(lines, (line) => formatEffect(read(line))),
      lines
    );
  });

  it("writes parts: an anchor, a signed offset and a `when`", () => {
    const { when } = read('a: sound pop at word("x y", 2).end -3f');

    assert.strictEqual(
      "anchor" in when ? formatAnchor(when.anchor) : "",
      'word("x y", 2).end'
    );
    assert.strictEqual(formatOffset({ unit: "percent", value: 50 }), "+50%");
    assert.strictEqual(formatOffset({ unit: "ms", value: -200 }), "-200ms");
    assert.strictEqual(formatWhen(when), 'word("x y", 2).end -3f');
  });
});

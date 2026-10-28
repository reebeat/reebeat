// alignWords: fixed cases and properties. Hand-worked expectations; the properties hold for any input.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Schema } from "effect";

import { alignWords, matchThreshold, normaliseWord } from "../src/align.ts";
import type { HeardWord } from "../src/align.ts";
import { perfectlyHeard } from "./support.ts";

const heard = (
  ...entries: readonly (readonly [string, number, number])[]
): readonly HeardWord[] =>
  Arr.map(entries, ([w, startMs, endMs]) => ({ endMs, startMs, w }));

describe("normaliseWord", () => {
  it("ignores case and punctuation, and maps closed spelling and numeral tables", () => {
    assert.strictEqual(normaliseWord("Don't,"), "dont");
    assert.strictEqual(normaliseWord('"Colour!"'), "color");
    assert.strictEqual(normaliseWord("3"), "three");
    assert.strictEqual(normaliseWord("moves."), "moves");
    assert.strictEqual(normaliseWord("2024"), "2024");
  });
});

describe("alignWords", () => {
  it("takes the heard times of words it matches, keeping the Line's own words", () => {
    const result = alignWords(
      ["Here", "is", "a", "box."],
      heard(
        ["here", 100, 300],
        ["is", 300, 400],
        ["a", 400, 450],
        ["box", 450, 900]
      ),
      1000
    );

    assert.strictEqual(result.match, 1);
    assert.deepStrictEqual(result.words, [
      { endMs: 300, startMs: 100 },
      { endMs: 400, startMs: 300 },
      { endMs: 450, startMs: 400 },
      { endMs: 900, startMs: 450 },
    ]);
  });

  it("matches a spelling difference and a numeral", () => {
    const result = alignWords(
      ["The", "color", "of", "two."],
      heard(
        ["The", 0, 100],
        ["colour", 100, 400],
        ["of", 400, 500],
        ["2", 500, 800]
      ),
      800
    );

    assert.strictEqual(result.match, 1);
  });

  it("spreads unmatched words over the gap between their neighbours by length", () => {
    // "bb" and "cc" are not heard: the gap 100..900 is shared 400 ms each.
    const result = alignWords(
      ["a", "bb", "cc", "dd"],
      heard(["a", 0, 100], ["dd", 900, 1000]),
      1000
    );

    assert.deepStrictEqual(result.words, [
      { endMs: 100, startMs: 0 },
      { endMs: 500, startMs: 100 },
      { endMs: 900, startMs: 500 },
      { endMs: 1000, startMs: 900 },
    ]);
    assert.strictEqual(result.match, (2 * 2) / (4 + 2));
  });

  it("weights an interpolated gap by word length", () => {
    // "x" and "yyy" share 0..400 as 1:3.
    const result = alignWords(
      ["x", "yyy", "end"],
      heard(["end", 400, 500]),
      500
    );

    assert.deepStrictEqual(result.words, [
      { endMs: 100, startMs: 0 },
      { endMs: 400, startMs: 100 },
      { endMs: 500, startMs: 400 },
    ]);
  });

  it("one misheard word costs one match and moves no other word", () => {
    const result = alignWords(
      ["Here", "the", "names", "are", "one", "and", "two", "so", "go"],
      heard(
        ["hear", 0, 100],
        ["the", 100, 200],
        ["names", 200, 300],
        ["are", 300, 400],
        ["one", 400, 500],
        ["and", 500, 600],
        ["two", 600, 700],
        ["so", 700, 800],
        ["go", 800, 900]
      ),
      900
    );

    assert.strictEqual(result.match, (2 * 8) / 18);
    assert.deepStrictEqual(result.words[0], { endMs: 100, startMs: 0 });
    assert.deepStrictEqual(result.words[8], { endMs: 900, startMs: 800 });
    assert.isBelow(result.match, matchThreshold);
  });

  it("clamps a last word that overshoots the audio", () => {
    const result = alignWords(
      ["one", "two"],
      heard(["one", 0, 500], ["two", 500, 1400]),
      1000
    );

    assert.deepStrictEqual(result.words[1], { endMs: 1000, startMs: 500 });
  });

  it("is below the threshold when the heard words are other words", () => {
    const result = alignWords(
      ["Names", "are", "cheap"],
      heard(
        ["completely", 0, 100],
        ["different", 100, 200],
        ["speech", 200, 300]
      ),
      300
    );

    assert.strictEqual(result.match, 0);
    assert.isBelow(result.match, matchThreshold);
    assert.strictEqual(result.words.length, 3);
  });

  it("aligns an empty Line to nothing", () => {
    assert.deepStrictEqual(alignWords([], [], 0), { match: 1, words: [] });
    assert.deepStrictEqual(alignWords([], heard(["x", 0, 1]), 1), {
      match: 0,
      words: [],
    });
  });
});

const Ms = Schema.Int.check(Schema.isBetween({ maximum: 20_000, minimum: 0 }));
const Spoken = Schema.Struct({ endMs: Ms, startMs: Ms, w: Schema.String });

describe("alignWords properties", () => {
  it.prop(
    "for any input: one span per Line word, inside [0, duration], in order, match in [0, 1]",
    [Schema.Array(Schema.String), Schema.Array(Spoken), Ms],
    ([lineWords, heardWords, durationMs]) => {
      const { match, words } = alignWords(lineWords, heardWords, durationMs);
      let previousEnd = 0;

      assert.strictEqual(words.length, lineWords.length);
      assert.isTrue(match >= 0 && match <= 1);

      for (const word of words) {
        assert.isTrue(Number.isInteger(word.startMs));
        assert.isTrue(Number.isInteger(word.endMs));
        assert.isTrue(word.startMs >= previousEnd);
        assert.isTrue(word.endMs >= word.startMs);
        assert.isTrue(word.endMs <= durationMs);
        previousEnd = word.endMs;
      }
    }
  );

  it.prop(
    "words heard exactly keep their times and match 1",
    [
      Schema.NonEmptyArray(
        Schema.Int.check(Schema.isBetween({ maximum: 999, minimum: 0 }))
      ),
    ],
    ([numbers]) => {
      const lineWords = Arr.map(numbers, (n) => `word${n}`);
      const exact = perfectlyHeard(lineWords);

      const { match, words } = alignWords(
        lineWords,
        exact,
        lineWords.length * 100
      );

      assert.strictEqual(match, 1);
      assert.deepStrictEqual(
        words,
        Arr.map(exact, ({ endMs, startMs }) => ({ endMs, startMs }))
      );
    }
  );

  it.prop(
    "one word not heard costs exactly one match and leaves every other word's time alone",
    [
      Schema.Array(
        Schema.Int.check(Schema.isBetween({ maximum: 9999, minimum: 0 }))
      ).check(Schema.isMinLength(3)),
      Schema.Int.check(Schema.isBetween({ maximum: 1000, minimum: 0 })),
    ],
    ([numbers, pick]) => {
      const lineWords = Arr.map(numbers, (n, index) => `w${index}x${n}`);
      const skipped = pick % lineWords.length;
      const exact = perfectlyHeard(lineWords);
      const partial = Arr.filter(exact, (_, index) => index !== skipped);

      const { match, words } = alignWords(
        lineWords,
        partial,
        lineWords.length * 100
      );

      assert.strictEqual(
        match,
        (2 * partial.length) / (lineWords.length + partial.length)
      );

      for (const [index, word] of words.entries()) {
        if (index !== skipped) {
          assert.deepStrictEqual(word, {
            endMs: exact[index]?.endMs ?? -1,
            startMs: exact[index]?.startMs ?? -1,
          });
        }
      }
    }
  );
});

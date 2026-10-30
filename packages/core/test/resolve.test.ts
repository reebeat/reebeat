// The two pure helpers under the schedule: the eased progress of a move (the bezier a renderer declares) and the
// phrase search that `word("...")` anchors use.
import { assert, describe, it } from "@effect/vitest";

import { timeOfProgress } from "../src/resolve.ts";
import { findPhrase, narrationWords } from "../src/words.ts";

describe("timeOfProgress", () => {
  const ease = [0.25, 0.1, 0.25, 1] as const;
  const linear = [0, 0, 1, 1] as const;

  it("is the identity for the linear bezier and 0 and 1 at the ends of any", () => {
    for (const progress of [0, 0.25, 0.5, 0.8, 1]) {
      assert.closeTo(timeOfProgress(linear, progress), progress, 1e-9);
    }

    assert.closeTo(timeOfProgress(ease, 0), 0, 1e-9);
    assert.closeTo(timeOfProgress(ease, 1), 1, 1e-9);
  });

  it("reaches half of the way at 29.33 % of the time for CSS ease (solved independently on a fine bisection)", () => {
    assert.closeTo(timeOfProgress(ease, 0.5), 0.2933006685, 1e-6);
    assert.closeTo(timeOfProgress(ease, 0.25), 0.1799900766, 1e-6);
    assert.closeTo(timeOfProgress(ease, 0.8), 0.4975931842, 1e-6);
  });

  it("never goes back: more progress takes more time", () => {
    let before = -1;

    for (let step = 0; step <= 100; step += 1) {
      const at = timeOfProgress(ease, step / 100);

      assert.isAtLeast(at, before);
      before = at;
    }
  });
});

describe("findPhrase", () => {
  const lines = [{ text: "Box one, box TWO. Box" }, { text: "The box two" }];

  it("finds a word whatever its case and punctuation, in narration order", () => {
    assert.deepStrictEqual(findPhrase(lines, "box"), [
      { from: 0, line: 0, to: 0 },
      { from: 2, line: 0, to: 2 },
      { from: 4, line: 0, to: 4 },
      { from: 1, line: 1, to: 1 },
    ]);
  });

  it("finds a phrase of several words that stand next to each other in one Line", () => {
    assert.deepStrictEqual(findPhrase(lines, "box two"), [
      { from: 2, line: 0, to: 3 },
      { from: 1, line: 1, to: 2 },
    ]);
  });

  it("does not join the end of one Line to the start of the next, and finds nothing for an absent phrase", () => {
    assert.deepStrictEqual(findPhrase(lines, "box box"), []);
    assert.deepStrictEqual(findPhrase(lines, "nothing"), []);
    assert.deepStrictEqual(findPhrase(lines, ""), []);
  });

  it("lists the distinct words of a Scene without punctuation, for did you mean", () => {
    assert.deepStrictEqual(narrationWords(lines), [
      "Box",
      "one",
      "box",
      "TWO",
      "The",
      "two",
    ]);
  });
});

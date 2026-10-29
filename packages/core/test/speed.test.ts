// The speech rate: a story default (`Speed:` of the title page, 1.1 when absent), `(speed N)` for one Line, and the
// presets `(slowly)` and `(quickly)` relative to the default, clamped to 0.5 to 2. Every bad value is an error with
// its source line.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import { asText, fixtureSha256 } from "./support.ts";

/** A one-Scene story whose title page is `titleRows` and whose Lines are `lines` (each Line a list of rows). */
const story = (
  titleRows: readonly string[],
  lines: readonly (readonly string[])[]
): string =>
  asText([
    "Title: Rate",
    ...titleRows,
    "",
    "# Part",
    "",
    "INT. ONE",
    "",
    ...Arr.flatMap(lines, (rows) => ["NARRATOR", ...rows, ""]),
  ]);

/** The resolved speed of every Line, in order, and the story default. */
const speeds = (source: string) =>
  Effect.map(buildPlan(source, fixtureSha256), (plan) => ({
    default: plan.settings.speed,
    lines: Arr.flatMap(plan.scenes, (scene) =>
      Arr.map(scene.lines, (line) => line.hints.speed)
    ),
  }));

/** The tag and line of every error of a source. */
const problems = (source: string) =>
  Arr.map(collectErrors(source), (found) => [found._tag, found.line]);

describe("the speech rate", () => {
  it.effect("is 1.1 for every Line when the title page has no Speed", () =>
    Effect.gen(function* byDefault() {
      const found = yield* speeds(story([], [["One."], ["Two."]]));

      assert.deepStrictEqual(found, { default: 1.1, lines: [1.1, 1.1] });
    })
  );

  it.effect(
    "is the Speed of the title page for every Line and in the settings",
    () =>
      Effect.gen(function* titled() {
        const found = yield* speeds(
          story(["Speed: 1.5"], [["One."], ["Two."]])
        );

        assert.deepStrictEqual(found, { default: 1.5, lines: [1.5, 1.5] });
      })
  );

  it.effect("accepts both ends of the range and whole numbers", () =>
    Effect.gen(function* ends() {
      const low = yield* speeds(story(["Speed: 0.5"], [["One."]]));
      const high = yield* speeds(story(["Speed: 2"], [["One."]]));

      assert.strictEqual(low.default, 0.5);
      assert.strictEqual(high.default, 2);
    })
  );

  it.effect(
    "(speed N) sets one Line absolutely and leaves the others at the default",
    () =>
      Effect.gen(function* absolute() {
        const found = yield* speeds(
          story(["Speed: 1.5"], [["One."], ["(speed 0.8)", "Two."], ["Three."]])
        );

        assert.deepStrictEqual(found, { default: 1.5, lines: [1.5, 0.8, 1.5] });
      })
  );

  it.effect("(slowly) is 0.9 and (quickly) 1.1 times the story default", () =>
    Effect.gen(function* presets() {
      const found = yield* speeds(
        story(
          ["Speed: 1.5"],
          [
            ["(slowly)", "One."],
            ["(quickly)", "Two."],
          ]
        )
      );

      // 1.5 * 0.9 = 1.35; 1.5 * 1.1 = 1.65.
      assert.deepStrictEqual(found.lines, [1.35, 1.65]);
    })
  );

  it.effect("a preset is clamped to the range", () =>
    Effect.gen(function* clamped() {
      const fast = yield* speeds(story(["Speed: 2"], [["(quickly)", "One."]]));
      const slow = yield* speeds(story(["Speed: 0.5"], [["(slowly)", "One."]]));

      assert.deepStrictEqual(fast.lines, [2]);
      assert.deepStrictEqual(slow.lines, [0.5]);
    })
  );

  it.effect(
    "a preset follows the default 1.1 when the title page has no Speed",
    () =>
      Effect.gen(function* relative() {
        const found = yield* speeds(
          story(
            [],
            [
              ["(slowly)", "One."],
              ["(quickly)", "Two."],
            ]
          )
        );

        // 1.1 * 0.9 = 0.99; 1.1 * 1.1 = 1.21 (rounded to four decimals, not 1.2100000000000002).
        assert.deepStrictEqual(found.lines, [0.99, 1.21]);
      })
  );

  it.effect("(pause N) still stands next to a speed hint", () =>
    Effect.gen(function* both() {
      const plan = yield* buildPlan(
        story([], [["(speed 1.3)", "(pause 0.5)", "One."]]),
        fixtureSha256
      );

      assert.deepStrictEqual(plan.scenes[0]?.lines[0]?.hints, {
        pauseBefore: 0.5,
        speed: 1.3,
      });
    })
  );
});

describe("a bad speed is an error with its line", () => {
  it("Speed: that is not a number (line 2)", () => {
    assert.deepStrictEqual(problems(story(["Speed: fast"], [["One."]])), [
      ["BadSpeed", 2],
    ]);
  });

  it("Speed: above 2 and below 0.5 (line 2)", () => {
    assert.deepStrictEqual(problems(story(["Speed: 2.1"], [["One."]])), [
      ["BadSpeed", 2],
    ]);
    assert.deepStrictEqual(problems(story(["Speed: 0.4"], [["One."]])), [
      ["BadSpeed", 2],
    ]);
  });

  it("a negative or empty Speed: is not a number", () => {
    assert.deepStrictEqual(problems(story(["Speed: -1"], [["One."]])), [
      ["BadSpeed", 2],
    ]);
  });

  it("a second Speed: names the line of the second (line 3)", () => {
    assert.deepStrictEqual(
      problems(story(["Speed: 1.2", "Speed: 1.3"], [["One."]])),
      [["BadSpeed", 3]]
    );
  });

  it("(speed 3) is outside the range, on the line of the parenthetical", () => {
    const source = story([], [["(speed 3)", "One."]]);

    assert.deepStrictEqual(problems(source), [["BadSpeed", 8]]);
    assert.include(collectErrors(source)[0]?.message ?? "", "0.5 to 2");
  });

  it("(speed fast) is not a number", () => {
    assert.deepStrictEqual(problems(story([], [["(speed fast)", "One."]])), [
      ["BadSpeed", 8],
    ]);
  });

  it("(speed) with no value is outside the vocabulary", () => {
    assert.deepStrictEqual(problems(story([], [["(speed)", "One."]])), [
      ["BadParenthetical", 8],
    ]);
  });

  it("two speed hints before one Line, in any mix, fail on the second (line 9)", () => {
    assert.deepStrictEqual(
      problems(story([], [["(speed 1.2)", "(slowly)", "One."]])),
      [["BadParenthetical", 9]]
    );
    assert.deepStrictEqual(
      problems(story([], [["(slowly)", "(speed 1.2)", "One."]])),
      [["BadParenthetical", 9]]
    );
  });

  it("Title: and Author: stay the only other title page keys", () => {
    assert.deepStrictEqual(
      problems(story(["Author: me", "Voice: x"], [["One."]])),
      [["UnsupportedElement", 3]]
    );
  });
});

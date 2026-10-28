// F10, the loud half: each error of the Plan stage is raised for one mutation of a small valid story, with the
// error's tag and the exact source line. `buildPlan` fails with the first error in document order;
// `collectErrors` lists them all in that order.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import type { PlanError } from "../src/errors.ts";
import { asText, lineOf } from "./support.ts";

const base = asText([
  "Title: Errors",
  "",
  "# Section",
  "",
  "INT. ONE",
  "",
  "Box {#a @tl .box}",
  "Later {#h @mc hidden}",
  "",
  "NARRATOR",
  "Hello there. [[next]] Goodbye. [[focus: a]]",
  "",
]);

/** The base story with its only occurrence of `from` replaced by `to`. */
const change = (from: string, to: string): string => {
  assert.strictEqual(
    base.split(from).length,
    2,
    `${from} occurs once in the base`
  );

  return base.replace(from, to);
};

const firstError = (source: string) => Effect.flip(buildPlan(source));

/** What a mutation must produce: the tag, and the needle of the line that carries the mistake. */
interface Case {
  readonly name: string;
  readonly needle: string;
  readonly source: string;
  readonly tag: PlanError["_tag"];
}

const cases: readonly Case[] = [
  {
    name: "a sub-section (##) is not part of the vocabulary",
    needle: "## Deeper",
    source: change("INT. ONE", "## Deeper\n\nINT. ONE"),
    tag: "UnsupportedElement",
  },
  {
    name: "an unknown cue kind",
    needle: "[[wave]]",
    source: change("[[focus: a]]", "[[wave]]"),
    tag: "UnknownCue",
  },
  {
    name: "a duplicate #id in one Scene",
    needle: "Again {#a",
    source: change("Box {#a @tl .box}", "Box {#a @tl .box}\nAgain {#a @tr}"),
    tag: "DuplicateId",
  },
  {
    name: "an Element without #id",
    needle: "No id here",
    source: change("Box {#a @tl .box}", "Box {#a @tl .box}\nNo id here"),
    tag: "MissingId",
  },
  {
    name: "[[focus: id]] with an unknown id",
    needle: "[[focus: nope]]",
    source: change("[[focus: a]]", "[[focus: nope]]"),
    tag: "CueTargetMissing",
  },
  {
    name: "[[next]] with nothing hidden left",
    needle: "Goodbye. [[next]]",
    source: change("[[focus: a]]", "[[next]]"),
    tag: "NextWithNothingHidden",
  },
  {
    name: "a hidden Element no [[next]] reveals",
    needle: "Later {#h",
    source: change("[[next]] ", ""),
    tag: "HiddenNeverRevealed",
  },
  {
    name: "a parenthetical outside the vocabulary",
    needle: "(whisper)",
    source: change("NARRATOR", "NARRATOR\n(whisper)"),
    tag: "BadParenthetical",
  },
  {
    name: "a parenthetical with no dialogue after it",
    needle: "(slowly)",
    source: `${base}\nNARRATOR\n(slowly)\n`,
    tag: "BadParenthetical",
  },
  {
    name: "a transition other than AUTO-ANIMATE and CUT",
    needle: "> FADE",
    source: change("INT. ONE", "> FADE\n\nINT. ONE"),
    tag: "BadTransition",
  },
  {
    name: "> AUTO-ANIMATE on the first Scene",
    needle: "> AUTO-ANIMATE",
    source: change("INT. ONE", "> AUTO-ANIMATE\n\nINT. ONE"),
    tag: "BadTransition",
  },
  {
    name: "a transition that leads into no Scene",
    needle: "> CUT",
    source: `${base}\n> CUT\n`,
    tag: "BadTransition",
  },
  {
    name: "a sound outside the catalogue",
    needle: "[[sfx: boom]]",
    source: change("[[focus: a]]", "[[sfx: boom]]"),
    tag: "UnknownSfx",
  },
  {
    name: "emphasis in dialogue",
    needle: "*there*",
    source: change("Hello there.", "Hello *there*."),
    tag: "EmphasisInDialogue",
  },
  {
    name: "a first Scene before any Section",
    needle: "INT. ONE",
    source: change("# Section\n\n", ""),
    tag: "SceneBeforeSection",
  },
  {
    name: "a source with no Scene",
    needle: "Title:",
    source: "Title: Nothing\n",
    tag: "EmptyStory",
  },
];

describe("F10: every error is raised for its mutation, with its line", () => {
  it.effect.each(cases)("$tag: $name", ({ needle, source, tag }) =>
    Effect.gen(function* raised() {
      const error = yield* firstError(source);

      assert.strictEqual(error._tag, tag);
      assert.strictEqual(error.line, lineOf(source, needle));
      assert.isAbove(error.message.length, 0);
      assert.deepStrictEqual(
        Arr.map(collectErrors(source), (found) => [found._tag, found.line]),
        [[tag, error.line]]
      );
    })
  );

  it("the valid base story builds, so each case above changes exactly one thing", () => {
    assert.deepStrictEqual(collectErrors(base), []);
  });

  it.effect(
    "buildPlan fails with the first error in document order; collectErrors lists all",
    () =>
      Effect.gen(function* ordered() {
        // The emphasis (line 11) is found while reading dialogue; the hidden Element (line 8) when checking Cues.
        const source = change("[[next]] ", "").replace(
          "Hello there.",
          "Hello *there*."
        );

        const first = yield* firstError(source);

        assert.deepStrictEqual(
          Arr.map(collectErrors(source), (found) => [found._tag, found.line]),
          [
            ["HiddenNeverRevealed", lineOf(source, "Later {#h")],
            ["EmphasisInDialogue", lineOf(source, "*there*")],
          ]
        );
        assert.strictEqual(first._tag, "HiddenNeverRevealed");
        assert.strictEqual(first.line, lineOf(source, "Later {#h"));
      })
  );
});

// F4 of spec 0002, the acceptance test of the replacement hints: the release-1 story (`fixtures/release1.fountain`, the
// text of `stories/same-id` at release 1) is rewritten by a helper that reads ONLY the error messages and the line
// numbers they carry, and the rewritten story must have no error at all. If a message wrote an id that another message
// also wrote, an anchor that is ambiguous, an Element that does not exist, or a position that is wrong, the rewritten
// story fails and this test names the error.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Predicate, String as Str } from "effect";

import { buildPlan, collectErrors } from "../src/build.ts";
import type { PlanError } from "../src/errors.ts";
import { fixtureSha256, readFixture } from "./support.ts";

// What a message tells the author to do, read from its text alone.
const headingPattern = /did you mean "(?<heading>[^"]*)"\?$/u;
const elementPattern = /expected key=value properties: (?<line>.*)$/u;
const cuePattern = /^release-1 cue (?<cue>\[\[.*?\]\]) in dialogue; /u;

const writePattern =
  /write (?<effect>.*) in the \[\[effects\]\] block of the Scene$/u;

interface Rewrite {
  /** Per Scene (its heading line): the effect lines its messages wrote, in document order. */
  readonly effects: Map<number, string[]>;
  /** Per Scene: the last line of its Elements, after which its block goes. */
  readonly lastElement: Map<number, number>;
  /** The source lines with the headings, Elements and dialogue rewritten. */
  readonly lines: string[];
}

const exactly = (found: PlanError, pattern: RegExp, group: string): string => {
  const text = pattern.exec(found.message)?.groups?.[group];

  assert.isDefined(
    text,
    `${found._tag} (line ${found.line}): ${found.message}`
  );

  return text ?? "";
};

const rewriteHeading = (rewrite: Rewrite, found: PlanError): void => {
  rewrite.lines[found.line - 1] = exactly(found, headingPattern, "heading");
};

const rewriteElement = (
  rewrite: Rewrite,
  found: PlanError,
  scene: number
): void => {
  rewrite.lines[found.line - 1] = exactly(found, elementPattern, "line");
  rewrite.lastElement.set(
    scene,
    Math.max(rewrite.lastElement.get(scene) ?? 0, found.line)
  );
};

const rewriteCue = (
  rewrite: Rewrite,
  found: PlanError,
  scene: number
): void => {
  const cue = exactly(found, cuePattern, "cue");
  const line = rewrite.lines[found.line - 1] ?? "";

  assert.isTrue(Str.includes(cue)(line), `${cue} stands on line ${found.line}`);
  rewrite.lines[found.line - 1] = Str.replace(cue, "")(line);

  const effect = writePattern.exec(found.message)?.groups?.effect;

  if (effect !== undefined) {
    rewrite.effects.set(scene, [...(rewrite.effects.get(scene) ?? []), effect]);
  }
};

const rewriteOne = (
  rewrite: Rewrite,
  found: PlanError,
  scene: number
): void => {
  if (Predicate.isTagged(found, "BadSceneId")) {
    rewriteHeading(rewrite, found);
  } else if (elementPattern.test(found.message)) {
    rewriteElement(rewrite, found, scene);
  } else if (cuePattern.test(found.message)) {
    rewriteCue(rewrite, found, scene);
  } else {
    assert.fail(
      `no way to apply: ${found._tag} (line ${found.line}): ${found.message}`
    );
  }
};

/** Applies every message of `errors` to `source`; fails the test on a message it does not know how to apply. */
const apply = (source: string, errors: readonly PlanError[]): string => {
  const rewrite: Rewrite = {
    effects: new Map(),
    lastElement: new Map(),
    lines: Str.split(source, "\n"),
  };

  const headings = Arr.map(
    Arr.filter(errors, (found) => Predicate.isTagged(found, "BadSceneId")),
    (found) => found.line
  );

  for (const found of errors) {
    rewriteOne(
      rewrite,
      found,
      Option.getOrElse(
        Arr.findLast(headings, (heading) => heading <= found.line),
        () => 0
      )
    );
  }

  // Each Scene's block goes right after its last Element line; later Scenes first, so the numbers stay true.
  for (const [scene, effects] of Arr.reverse([...rewrite.effects.entries()])) {
    rewrite.lines.splice(
      rewrite.lastElement.get(scene) ?? scene,
      0,
      "",
      "[[effects",
      ...Arr.map(effects, (effect) => `  ${effect}`),
      "]]"
    );
  }

  return Arr.join(rewrite.lines, "\n");
};

const describeErrors = (errors: readonly PlanError[]): string =>
  Arr.join(
    Arr.map(
      errors,
      (found) => `${found._tag} (line ${found.line}): ${found.message}`
    ),
    "\n"
  );

describe("the release-1 story, rewritten by its own error messages", () => {
  it.effect(
    "has an error for every release-1 form, and applying them all leaves none",
    () =>
      Effect.gen(function* acceptance() {
        const source = yield* readFixture("release1.fountain");
        const errors = collectErrors(source);

        // Every Scene heading, Element line and cue is listed, each with its replacement.
        assert.isAbove(errors.length, 20, describeErrors(errors));

        const after = collectErrors(apply(source, errors));

        assert.strictEqual(after.length, 0, describeErrors(after));

        // The same rewrite is a Plan: every Scene has its id and its effects, every hidden Element is shown once.
        const plan = yield* buildPlan(apply(source, errors), fixtureSha256);

        assert.deepStrictEqual(
          Arr.map(plan.scenes, (scene) => [scene.id, scene.effects.length]),
          [
            ["sc1", 0],
            ["sc2", 2],
            ["sc3", 1],
            ["sc4", 1],
            ["sc5", 1],
            ["sc6", 2],
            ["sc7", 0],
          ]
        );
      })
  );

  it.effect(
    "gives each effect of a Scene its own id, numbered in document order by verb",
    () =>
      Effect.gen(function* ids() {
        const errors = collectErrors(yield* readFixture("release1.fountain"));

        const written = Arr.flatMap(errors, (found) => {
          const effect = writePattern.exec(found.message)?.groups?.effect;

          return effect === undefined
            ? []
            : [[found.line, Str.split(effect, ":")[0]]];
        });

        assert.deepStrictEqual(written, [
          [30, "f1"],
          [33, "r1"],
          [48, "f1"],
          [59, "s1"],
          [75, "s1"],
          [91, "r1"],
          [91, "r2"],
        ]);
      })
  );
});

// F3 (notes equal dialogue) and F4 (fragments equal cues) on the written `deck.html`, read with the deck's own
// `readDeck` and compared with the Plan the source builds. Each is computed on its own, so a fault in a slide's
// fragments never hides one in a later slide's notes. `checkDeck` then covers what these two do not compare (the
// revealed Element of a fragment, the Elements, the slide marks, the slide order); its findings go to F4, because
// they are about what the slides show, not what they say.
import type { PlanJson, Scene } from "@reebeat/core";
import { checkDeck, readDeck } from "@reebeat/deck";
import type { DeckModel, DeckSlide } from "@reebeat/deck";
import { Array as Arr, Effect, Option, Result } from "effect";

import type { Build } from "./load.ts";
import { rebuiltPlan } from "./truth.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Verdict } from "./verdict.ts";

const show = (text: string | undefined): string =>
  text === undefined ? "nothing" : `"${text}"`;

/** The position of the first difference between two lists, or undefined when they are equal. */
const firstDifference = (
  wanted: readonly string[],
  found: readonly string[]
): number | undefined =>
  Option.getOrUndefined(
    Arr.findFirstIndex(
      Arr.range(0, Math.max(wanted.length, found.length) - 1),
      (index) => wanted[index] !== found[index]
    )
  );

const slideOf = (model: DeckModel, scene: Scene): DeckSlide | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(model.slides, (slide) => slide.sceneId === scene.id)
  );

const notesProblem = (
  scene: Scene,
  slide: DeckSlide | undefined
): readonly string[] => {
  const wanted = Arr.map(scene.lines, (line) => line.text);
  const at = firstDifference(wanted, slide?.notes ?? []);

  return at === undefined
    ? []
    : [
        `slide ${scene.id}, note ${at + 1}: the narration is ${show(wanted[at])}, the notes hold ${show(slide?.notes[at])}`,
      ];
};

/** The Cue of a fragment as `id kind arg`, the same string for a Cue of the Plan and a fragment of the page. */
const cueKey = (id: string, kind: string, arg: string | null): string =>
  `${id} ${kind}${arg === null || arg === "" ? "" : `: ${arg}`}`;

const fragmentsProblem = (
  scene: Scene,
  slide: DeckSlide | undefined
): readonly string[] => {
  const wanted = Arr.map(
    Arr.flatMap(scene.lines, (line) => line.cues),
    (cue) => cueKey(cue.id, cue.kind, cue.arg)
  );

  const found = Arr.map(slide?.fragments ?? [], (fragment) =>
    cueKey(fragment.cueId, fragment.kind, fragment.arg)
  );

  const at = firstDifference(wanted, found);

  return at === undefined
    ? []
    : [
        `slide ${scene.id}, fragment ${at}: the Plan has ${show(wanted[at])}, the page has ${show(found[at])}`,
      ];
};

const missingSlide = (scene: Scene, slide: DeckSlide | undefined) =>
  slide === undefined ? [`the page has no slide for scene ${scene.id}`] : [];

/**
 * The deck of the build against the Plan of the source. `checkDeck` runs with the page's own source hash, so a
 * stale hash (F5's) does not hide a fault that comes after it.
 */
const pageMismatch = (plan: PlanJson, model: DeckModel, html: string) =>
  Effect.result(
    checkDeck(
      {
        ...plan,
        sourceSha256:
          model.htmlSourceSha256 ?? model.metaSourceSha256 ?? plan.sourceSha256,
      },
      html
    )
  );

/** The verdicts of F3 and F4. */
export const deckVerdicts = Effect.fn("deckVerdicts")(function* deck(
  build: Build
): Effect.fn.Return<readonly [Verdict, Verdict]> {
  const plan = rebuiltPlan(build);

  if (Result.isFailure(plan)) {
    return [fail("F3", plan.failure), fail("F4", plan.failure)];
  }

  const model = readDeck(build.deckHtml);
  const mismatch = yield* pageMismatch(plan.success, model, build.deckHtml);

  const checked = Arr.map(plan.success.scenes, (scene) => ({
    scene,
    slide: slideOf(model, scene),
  }));

  const noteCount = Arr.reduce(
    plan.success.scenes,
    0,
    (sum, scene) => sum + scene.lines.length
  );

  const cueCount = Arr.reduce(
    plan.success.scenes,
    0,
    (sum, scene) =>
      sum +
      Arr.reduce(scene.lines, 0, (inner, line) => inner + line.cues.length)
  );

  const unmatched = Result.isFailure(mismatch) ? mismatch.failure : undefined;

  const notes = [
    ...Arr.flatMap(checked, ({ scene, slide }) => [
      ...missingSlide(scene, slide),
      ...notesProblem(scene, slide),
    ]),
    ...(unmatched?.check === "F3 notes" ? [unmatched.message] : []),
  ];

  const fragments = [
    ...Arr.flatMap(checked, ({ scene, slide }) =>
      fragmentsProblem(scene, slide)
    ),
    ...(unmatched !== undefined &&
    unmatched.check !== "F3 notes" &&
    unmatched.check !== "F5 source hash"
      ? [`${unmatched.check}: ${unmatched.message}`]
      : []),
  ];

  return [
    verdictOf(
      "F3",
      `the notes of all ${model.slides.length} slides equal the narration of their Scene's Lines`,
      notes,
      [
        ["slides", model.slides.length],
        ["notes compared", noteCount],
      ]
    ),
    verdictOf(
      "F4",
      `every slide has one fragment per Cue of its Scene, in order, and shows the Plan's Elements and marks`,
      fragments,
      [
        ["slides", model.slides.length],
        ["fragments compared", cueCount],
      ]
    ),
  ];
});

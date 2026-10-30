// F3 (notes equal dialogue) and F4 (fragments equal the `show` and `focus` effects, sounds equal `data-sounds`) on the
// written `deck.html`, read with the deck's own `readDeck` and compared with the Plan the source builds, resolved by
// the Timeline of `plan.json` (the order of the fragments is the order in time). Each is computed on its own, so a fault in a slide's
// fragments never hides one in a later slide's notes. `checkDeck` then covers what these two do not compare (the
// revealed Element of a fragment, the Elements, the slide marks, the slide order); its findings go to F4, because
// they are about what the slides show, not what they say.
import type { PlanJson, Scene } from "@tsukuri/core";
import { effectFragmentAgreement, firstDifference } from "@tsukuri/lint";
import type { Fragment } from "@tsukuri/lint";
import { checkDeck, readDeck } from "@tsukuri/render-reveal";
import type { DeckModel, DeckSlide } from "@tsukuri/render-reveal";
import { Array as Arr, Effect, Option, Result } from "effect";

import type { Build } from "./load.ts";
import { rebuiltPlan } from "./truth.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Verdict } from "./verdict.ts";

const show = (text: string | undefined): string =>
  text === undefined ? "nothing" : `"${text}"`;

const slideOf = (model: DeckModel, scene: Scene): DeckSlide | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(model.slides, (slide) => slide.sceneId === scene.id)
  );

const notesProblem = (
  scene: Scene,
  slide: DeckSlide | undefined
): readonly string[] => {
  const wanted = Arr.map(scene.lines, (line) => line.text);

  const at = firstDifference(
    wanted,
    slide?.notes ?? [],
    (want, have) => want === have
  );

  return at === undefined
    ? []
    : [
        `slide ${scene.id}, note ${at + 1}: the narration is ${show(wanted[at])}, the notes hold ${show(slide?.notes[at])}`,
      ];
};

/** The fragments the page shows, each with the scene of the slide it is on, as the lint rule reads them. */
const fragmentsOf = (model: DeckModel): readonly Fragment[] =>
  Arr.flatMap(model.slides, (slide) =>
    Arr.map(slide.fragments, (fragment) => ({
      effectId: fragment.effectId,
      sceneId: slide.sceneId,
      target: fragment.target,
      verb: fragment.verb,
    }))
  );

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
  const rebuilt = rebuiltPlan(build);

  if (Result.isFailure(rebuilt)) {
    return [fail("F3", rebuilt.failure), fail("F4", rebuilt.failure)];
  }

  // The rebuilt Plan has no Timeline; the order of the steps and the carrier of each sound come from the written one.
  const plan: PlanJson = {
    ...rebuilt.success,
    timeline: build.plan.timeline,
  };

  const model = readDeck(build.deckHtml);
  const mismatch = yield* pageMismatch(plan, model, build.deckHtml);

  const checked = Arr.map(plan.scenes, (scene) => ({
    scene,
    slide: slideOf(model, scene),
  }));

  const noteCount = Arr.reduce(
    plan.scenes,
    0,
    (sum, scene) => sum + scene.lines.length
  );

  const effectCount = Arr.reduce(
    plan.scenes,
    0,
    (sum, scene) =>
      sum +
      Arr.filter(scene.effects, (effect) => effect.verb !== "sound").length
  );

  const soundCount = Arr.reduce(
    plan.scenes,
    0,
    (sum, scene) =>
      sum +
      Arr.filter(scene.effects, (effect) => effect.verb === "sound").length
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
    ...Arr.map(
      effectFragmentAgreement(plan, fragmentsOf(model)),
      (diagnostic) => diagnostic.message
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
      `every slide has one fragment per show or focus effect of its Scene in resolved order, carries the sounds of the Plan in data-sounds, and shows the Plan's Elements and marks`,
      fragments,
      [
        ["slides", model.slides.length],
        ["fragments compared", effectCount],
        ["sounds carried", soundCount],
      ]
    ),
  ];
});

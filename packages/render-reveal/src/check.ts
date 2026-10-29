// The Deck against its Plan (spec 0001, F3 to F5, deck side; spec 0002, F4). `checkDeck` reads a written `deck.html`
// with `readDeck` and compares it with the Plan: the source hash, the slides in order, the notes (F3), the fragments
// (F4/F5: one per step, a start for each `show` or `focus` effect and an end for each ring that ends by its `until`, in
// resolved order, and the `data-sounds` of every sound), the Elements and the
// slide marks. It reports the first difference, naming the slide and the position in it.
import type { PlanJson, Scene } from "@reebeat/core";
import { effectFragmentAgreement, firstDifference } from "@reebeat/lint";
import type { Diagnostic, Fragment } from "@reebeat/lint";
import { Array as Arr, Effect, Option } from "effect";

import { DeckMismatch } from "./errors.ts";
import { expectedMarks, expectedSlide } from "./expected.ts";
import type { ExpectedMarks } from "./expected.ts";
import { readDeck } from "./read.ts";
import type { DeckModel, DeckSlide } from "./read.ts";

const show = (value: string | null | undefined): string =>
  value === null || value === undefined ? "nothing" : JSON.stringify(value);

const sourceMismatch = (
  plan: PlanJson,
  model: DeckModel
): DeckMismatch | undefined => {
  const found = [
    ["<html data-source-sha256>", model.htmlSourceSha256],
    ['<meta name="reebeat:source-sha256">', model.metaSourceSha256],
  ] as const;

  const wrong = Option.getOrUndefined(
    Arr.findFirst(found, ([, hash]) => hash !== plan.sourceSha256)
  );

  return wrong === undefined
    ? undefined
    : new DeckMismatch({
        check: "F5 source hash",
        index: null,
        message: `${wrong[0]} is ${wrong[1] ?? "absent"}, the Plan says ${plan.sourceSha256}`,
        slide: "",
      });
};

const slidesMismatch = (
  plan: PlanJson,
  model: DeckModel
): DeckMismatch | undefined => {
  const position = firstDifference(
    plan.scenes,
    model.slides,
    (scene, slide) =>
      scene.id === slide.sceneId && scene.chapterId === slide.chapterId
  );

  if (position === undefined) {
    return undefined;
  }

  const scene = plan.scenes[position];
  const slide = model.slides[position];

  return new DeckMismatch({
    check: "slides",
    index: position,
    message: `slide ${position + 1}: the Plan says scene ${scene?.id ?? "none"} in chapter ${scene?.chapterId ?? "none"}, the page has scene ${slide?.sceneId ?? "none"} in chapter ${slide?.chapterId ?? "none"}`,
    slide: slide?.sceneId ?? scene?.id ?? "",
  });
};

const notesMismatch = (
  scene: Scene,
  slide: DeckSlide
): DeckMismatch | undefined => {
  const position = firstDifference(
    scene.lines,
    slide.notes,
    (line, note) => line.text === note
  );

  return position === undefined
    ? undefined
    : new DeckMismatch({
        check: "F3 notes",
        index: position,
        message: `slide ${scene.id}, note ${position + 1}: the narration of ${scene.lines[position]?.id ?? "no Line"} is ${show(scene.lines[position]?.text)}, the notes hold ${show(slide.notes[position])}`,
        slide: scene.id,
      });
};

/** The fragments of every slide as the lint rule reads them: neutral, in page order. */
const pageFragments = (model: DeckModel): readonly Fragment[] =>
  Arr.flatMap(model.slides, (slide) =>
    Arr.map(slide.fragments, ({ edge, effectId, target, verb }) => ({
      edge,
      effectId,
      sceneId: slide.sceneId,
      target,
      verb,
    }))
  );

/** F4 as the lint rule `effect-fragment-agreement` says it: the steps' effect ids, edges, verbs and targets, in resolved order. */
const agreementMismatch = (
  scene: Scene,
  diagnostics: readonly Diagnostic[]
): DeckMismatch | undefined => {
  const found = Arr.findFirst(
    diagnostics,
    ({ sceneId }) => sceneId === scene.id
  );

  return Option.getOrUndefined(
    Option.map(
      found,
      ({ index, message }) =>
        new DeckMismatch({
          check: "F4 fragments",
          index: index ?? null,
          message,
          slide: scene.id,
        })
    )
  );
};

const listed = (names: readonly string[]): string =>
  names.length === 0 ? "no sound" : Arr.join(names, " ");

/**
 * What only the page can get wrong about a fragment the lint rule accepted: its index, and the sounds that ride along
 * on the slide and on each step (`data-sounds`).
 */
const stepsMismatch = (
  plan: PlanJson,
  scene: Scene,
  slide: DeckSlide
): DeckMismatch | undefined => {
  const wanted = expectedSlide(plan, scene);

  const fail = (message: string, index: number | null): DeckMismatch =>
    new DeckMismatch({
      check: "F4 fragments",
      index,
      message: `slide ${scene.id}${index === null ? "" : `, fragment ${index}`}: ${message}`,
      slide: scene.id,
    });

  if (listed(wanted.sounds) !== listed(slide.sounds)) {
    return fail(
      `the Plan plays ${listed(wanted.sounds)} when the slide is shown, the page's data-sounds is ${listed(slide.sounds)}`,
      null
    );
  }

  const position = firstDifference(
    wanted.fragments,
    slide.fragments,
    (want, have) =>
      String(want.index) === have.index &&
      want.edge === have.edge &&
      listed(want.sounds) === listed(have.sounds)
  );

  return position === undefined
    ? undefined
    : fail(
        `the Plan has index ${wanted.fragments[position]?.index ?? "none"} (${wanted.fragments[position]?.edge ?? "no edge"}) playing ${listed(wanted.fragments[position]?.sounds ?? [])}, the page has index ${show(slide.fragments[position]?.index)} (${slide.fragments[position]?.edge ?? "no edge"}) playing ${listed(slide.fragments[position]?.sounds ?? [])}`,
        position
      );
};

const sameElement = (
  want: Scene["elements"][number],
  have: DeckSlide["elements"][number]
): boolean =>
  want.cell === have.cell &&
  want.visible === have.visible &&
  want.text === have.text &&
  want.class === have.class;

const elementsMismatch = (
  scene: Scene,
  slide: DeckSlide
): DeckMismatch | undefined => {
  const fail = (message: string, index: number): DeckMismatch =>
    new DeckMismatch({ check: "elements", index, message, slide: scene.id });

  const [wrong] = Arr.flatMap(scene.elements, (want, index) =>
    Option.match(
      Arr.findFirst(slide.elements, (element) => element.id === want.id),
      {
        onNone: () => [
          fail(`slide ${scene.id}: Element ${want.id} is missing`, index),
        ],
        onSome: (have) =>
          sameElement(want, have)
            ? []
            : [
                fail(
                  `slide ${scene.id}: Element ${want.id} differs from the Plan (cell, class, visible or text)`,
                  index
                ),
              ],
      }
    )
  );

  if (wrong !== undefined) {
    return wrong;
  }

  // Every Element of the Plan is on the slide with the same properties; now look for one that is not in the Plan or
  // that appears twice.
  const extra = Arr.findFirstIndex(
    slide.elements,
    (element, index) =>
      !Arr.some(scene.elements, (want) => want.id === element.id) ||
      Option.getOrElse(
        Arr.findFirstIndex(slide.elements, (other) => other.id === element.id),
        () => index
      ) !== index
  );

  return Option.getOrUndefined(
    Option.map(extra, (index) =>
      fail(
        `slide ${scene.id}: Element ${slide.elements[index]?.id ?? ""} is not in the Plan or appears twice`,
        index
      )
    )
  );
};

const marksMismatch = (
  scene: Scene,
  slide: DeckSlide,
  marks: ExpectedMarks
): DeckMismatch | undefined =>
  marks.autoAnimate === slide.autoAnimate &&
  marks.transition === slide.transition
    ? undefined
    : new DeckMismatch({
        check: "transitions",
        index: null,
        message: `slide ${scene.id}: data-auto-animate-id and data-transition are ${show(slide.autoAnimate)} and ${show(slide.transition)}, the Plan says ${show(marks.autoAnimate)} and ${show(marks.transition)}`,
        slide: scene.id,
      });

/** The first difference between a page model and the Plan, or undefined. A plain function: no effect. */
const firstMismatch = (
  plan: PlanJson,
  model: DeckModel
): DeckMismatch | undefined => {
  const early = sourceMismatch(plan, model) ?? slidesMismatch(plan, model);

  if (early !== undefined) {
    return early;
  }

  const agreement = effectFragmentAgreement(plan, pageFragments(model));

  const marks = expectedMarks(plan);

  const [first] = Arr.flatMap(plan.scenes, (scene, index) => {
    const slide = model.slides[index];

    const mismatch =
      slide === undefined
        ? undefined
        : (notesMismatch(scene, slide) ??
          agreementMismatch(scene, agreement) ??
          stepsMismatch(plan, scene, slide) ??
          elementsMismatch(scene, slide) ??
          marksMismatch(
            scene,
            slide,
            marks[index] ?? { autoAnimate: null, transition: null }
          ));

    return mismatch === undefined ? [] : [mismatch];
  });

  return first;
};

/**
 * Checks a written `deck.html` against its Plan: F3 (notes equal the narration), F4 (fragments equal the steps of
 * `stepsOf`: effect, edge, verb and target, in order), the F5 hash, the slides, the Elements and the slide marks. Fails
 * with the first `DeckMismatch`.
 */
export const checkDeck = (plan: PlanJson, html: string) =>
  Effect.suspend(() => {
    const mismatch = firstMismatch(plan, readDeck(html));

    return mismatch === undefined ? Effect.void : Effect.fail(mismatch);
  });

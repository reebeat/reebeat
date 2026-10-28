// The Deck against its Plan (spec 0001, F3 to F5, deck side). `checkDeck` reads a written `deck.html` with
// `readDeck` and compares it with the Plan: the source hash, the slides in order, the notes (F3), the fragments (F4),
// the Elements and the slide marks. It reports the first difference, naming the slide and the position in it.
import type { PlanJson, Scene } from "@reebeat/core";
import { Array as Arr, Effect, Option } from "effect";

import { DeckMismatch } from "./errors.ts";
import { expectedFragments, expectedMarks } from "./expected.ts";
import type { ExpectedMarks } from "./expected.ts";
import { readDeck } from "./read.ts";
import type { DeckModel, DeckSlide } from "./read.ts";

/** The first position at which two lists differ (a missing or extra member counts), or undefined when they agree. */
const firstDifference = <Wanted, Found>(
  wanted: readonly Wanted[],
  found: readonly Found[],
  same: (want: Wanted, have: Found) => boolean
): number | undefined =>
  Option.match(
    Arr.findFirstIndex(
      Arr.zip(wanted, found),
      ([want, have]) => !same(want, have)
    ),
    {
      onNone: () =>
        wanted.length === found.length
          ? undefined
          : Math.min(wanted.length, found.length),
      onSome: (position) => position,
    }
  );

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

const describeFragment = (
  fragment: { cueId: string; kind: string; arg: string } | undefined
): string =>
  fragment === undefined
    ? "no fragment"
    : `${fragment.cueId} (${fragment.kind}${fragment.arg === "" ? "" : `: ${fragment.arg}`})`;

const fragmentsMismatch = (
  scene: Scene,
  slide: DeckSlide
): DeckMismatch | undefined => {
  const wanted = expectedFragments(scene);

  const position = firstDifference(
    wanted,
    slide.fragments,
    (want, have) =>
      want.cueId === have.cueId &&
      want.kind === have.kind &&
      want.arg === have.arg &&
      want.reveals === have.reveals &&
      String(want.index) === have.index
  );

  return position === undefined
    ? undefined
    : new DeckMismatch({
        check: "F4 fragments",
        index: position,
        message: `slide ${scene.id}, fragment ${position}: the Plan says ${describeFragment(wanted[position])}, the page has ${describeFragment(slide.fragments[position])}`,
        slide: scene.id,
      });
};

const sameElement = (
  want: Scene["elements"][number],
  have: DeckSlide["elements"][number]
): boolean =>
  want.cell === have.cell &&
  want.hidden === have.hidden &&
  want.text === have.text &&
  Arr.join(want.classes, " ") === Arr.join(have.classes, " ");

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
                  `slide ${scene.id}: Element ${want.id} differs from the Plan (cell, classes, hidden or text)`,
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

  const marks = expectedMarks(plan);

  const [first] = Arr.flatMap(plan.scenes, (scene, index) => {
    const slide = model.slides[index];

    const mismatch =
      slide === undefined
        ? undefined
        : (notesMismatch(scene, slide) ??
          fragmentsMismatch(scene, slide) ??
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
 * Checks a written `deck.html` against its Plan: F3 (notes equal the narration), F4 (fragments equal the Cues, in
 * kind, argument and order), the F5 hash, the slides, the Elements and the slide marks. Fails with the first
 * `DeckMismatch`.
 */
export const checkDeck = (plan: PlanJson, html: string) =>
  Effect.suspend(() => {
    const mismatch = firstMismatch(plan, readDeck(html));

    return mismatch === undefined ? Effect.void : Effect.fail(mismatch);
  });

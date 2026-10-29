// What the Plan says each slide must contain. `renderDeck` writes these values into the page and `checkDeck`
// compares the written page with them, so the generator and its checker share one derivation of the same facts.
import type { PlanJson, Scene } from "@reebeat/core";
import { Array as Arr } from "effect";

/** One fragment of a slide: the Cue it stands for, with the Element a `next` Cue reveals. */
export interface ExpectedFragment {
  readonly arg: string;
  readonly cueId: string;
  readonly index: number;
  readonly kind: "next" | "focus" | "sfx";
  readonly reveals: string;
}

/** The slide-level attributes of a Scene, derived from its own transition and the next Scene's. */
export interface ExpectedMarks {
  /** The `data-auto-animate-id` of the chain of Auto-Animate scenes the slide belongs to, or null. */
  readonly autoAnimate: string | null;
  /** `none` for a `> CUT`, else null (the deck default). */
  readonly transition: "none" | null;
}

/**
 * One fragment per Cue, in document order, indexed from 0. The k-th `next` Cue reveals the k-th hidden Element
 * (spec 0001: "the next `hidden` Element of this Scene, in document order"); a `next` with none left reveals
 * nothing here and is a plan error that the core reports.
 */
export const expectedFragments = (
  scene: Scene
): readonly ExpectedFragment[] => {
  const cues = Arr.flatMap(scene.lines, (line) => line.cues);
  const hidden = Arr.filter(scene.elements, (element) => element.hidden);

  return Arr.map(cues, (cue, index) => ({
    arg: cue.arg ?? "",
    cueId: cue.id,
    index,
    kind: cue.kind,
    reveals:
      cue.kind === "next"
        ? (hidden[
            Arr.filter(Arr.take(cues, index), ({ kind }) => kind === "next")
              .length
          ]?.id ?? "")
        : "",
  }));
};

/**
 * The slide marks of every Scene. Scenes joined by `auto-animate` form a chain: each member carries the same
 * `data-auto-animate-id`, so reveal.js animates between neighbours of one chain only and two separate chains
 * that touch (an `auto-animate` Scene, a `default` one, then another `auto-animate` Scene) never animate into each
 * other.
 */
export const expectedMarks = (plan: PlanJson): readonly ExpectedMarks[] => {
  const joinsPrevious = (index: number): boolean =>
    plan.scenes[index]?.transition === "auto-animate";

  // A chain starts at a Scene that is not joined to its predecessor but is joined by its successor.
  const startsChain = (index: number): boolean =>
    !joinsPrevious(index) && joinsPrevious(index + 1);

  return Arr.map(plan.scenes, (scene, index) => ({
    autoAnimate:
      joinsPrevious(index) || joinsPrevious(index + 1)
        ? `aa${Arr.filter(Arr.range(0, index), startsChain).length}`
        : null,
    transition: scene.transition === "cut" ? "none" : null,
  }));
};

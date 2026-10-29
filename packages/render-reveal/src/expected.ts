import type { PlanJson, Scene } from "@reebeat/core";
// What the Plan says each slide must contain. `renderDeck` writes these values into the page and `checkDeck` compares
// the written page with them, so the generator and its checker share one derivation of the same facts.
//
// A slide's steps and its sounds (spec 0002, "Deck: sounds ride along"): the `show` and `focus` effects of a Scene are
// its fragment steps, in RESOLVED-TIME order; a `sound` is never a step, it is data (`data-sounds`) on the thing it plays
// with. `@reebeat/core` says which (`stepsOf`, `soundsOf`: one definition for the Deck and for the check): a sound
// anchored to the slide change, the Scene's start or an Element event of the transition rides on the slide; a sound
// anchored to a `show` effect's Element enter, to a step, or later in time than a step rides on that step; a sound with
// no step before it plays alone in the Scene, which a Deck can only do with the slide.
import { soundsOf, stepsOf } from "@reebeat/core/steps";
import { Array as Arr } from "effect";

/**
 * One fragment of a slide: a step of a `show` or `focus` effect and the sounds that play with it. `edge` says which step:
 * `start` shows the effect, `end` takes a `focus` ring off (`data-effect-edge="end"`; a start has no such attribute).
 */
export interface ExpectedFragment {
  readonly edge: "end" | "start";
  readonly effectId: string;
  readonly index: number;
  /** The sound names that play when the step runs, in source order. */
  readonly sounds: readonly string[];
  /** The Element id the effect acts on. */
  readonly target: string;
  readonly verb: "focus" | "show";
}

/** What one slide must contain besides its Elements: the steps and the sounds of the slide itself. */
export interface ExpectedSlide {
  readonly fragments: readonly ExpectedFragment[];
  /** The sound names that play when the slide is shown, in source order. */
  readonly sounds: readonly string[];
}

/** The slide-level attributes of a Scene, derived from its own transition and the next Scene's. */
export interface ExpectedMarks {
  /** The `data-auto-animate-id` of the chain of Auto-Animate scenes the slide belongs to, or null. */
  readonly autoAnimate: string | null;
  /**
   * `none` for a `> CUT`, else null (the deck default). The theme makes the slide that a `none` slide replaces leave at
   * once (reveal.js takes the transition of the slide it LEAVES from that slide's own style), so this one mark is all a
   * cut needs: the page holds no second copy of the fact.
   */
  readonly transition: "none" | null;
}

/**
 * The steps and the sounds of a slide. `plan.timeline` supplies the resolved order; a Plan without one (`plan` output)
 * gives source order.
 */
export const expectedSlide = (plan: PlanJson, scene: Scene): ExpectedSlide => {
  const carried = soundsOf(plan, scene);

  const namesOn = (effectId?: string): readonly string[] =>
    Arr.flatMap(carried, ({ carrier, effect }) =>
      effect.name !== undefined &&
      (carrier.kind === "step"
        ? carrier.effectId === effectId
        : effectId === undefined)
        ? [effect.name]
        : []
    );

  return {
    fragments: Arr.map(
      stepsOf(plan, scene),
      ({ edge, effect }, index): ExpectedFragment => ({
        edge,
        effectId: effect.id,
        index,
        // A sound plays with the step that STARTS an effect: the end of a ring carries none.
        sounds: edge === "start" ? namesOn(effect.id) : [],
        target: effect.target ?? "",
        verb: effect.verb === "focus" ? "focus" : "show",
      })
    ),
    sounds: namesOn(),
  };
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

// How a Rendering carries the effects of a Scene (spec 0002, Revisions, "plan contract for effects"): `show` and
// `focus` are fragment steps in resolved-time order; a `sound` is not a step: it rides along with the step or the
// slide it is anchored to, and plays with it. This file is the one place that says which. A renderer and the
// verifier both read it, so the Deck and the check cannot disagree. Plain functions.
import { Array as Arr, Option, Order } from "effect";

import { effectOf } from "./lookup.ts";
import type { Effect, PlanJson, Scene, TimedEffect } from "./plan.ts";

/** An effect that changes what is on screen and so is one fragment step of its Scene. */
export interface Step {
  readonly effect: Effect;
  /** Absent until the Plan has a Timeline; the steps are then in source order. */
  readonly timed: TimedEffect | undefined;
}

/**
 * Where a sound plays:
 * - `slide`: with the slide change (anchored to the transition, the Scene's start, or an Element event that the slide
 *   change runs);
 * - `step`: with the fragment step of this effect (anchored to its Element's enter, to it, or after it in time);
 * - `alone`: a plain audio event of the Scene: it follows no step and no slide change.
 */
export type Carrier =
  | { readonly kind: "slide" }
  | { readonly effectId: string; readonly kind: "step" }
  | { readonly kind: "alone" };

/** A sound and where it plays. */
export interface CarriedSound {
  readonly carrier: Carrier;
  readonly effect: Effect;
  readonly timed: TimedEffect | undefined;
}

const timedOf = (
  plan: PlanJson,
  scene: Scene,
  effect: Effect
): TimedEffect | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      Option.getOrUndefined(
        Arr.findFirst(
          plan.timeline?.scenes ?? [],
          (candidate) => candidate.sceneId === scene.id
        )
      )?.effects ?? [],
      (candidate) => candidate.effectId === effect.id
    )
  );

const isStep = (effect: Effect): boolean => effect.verb !== "sound";

/** The fragment steps of a Scene in resolved-time order (source order without a Timeline; ties keep source order). */
export const stepsOf = (plan: PlanJson, scene: Scene): readonly Step[] =>
  Arr.sort(
    Arr.map(Arr.filter(scene.effects, isStep), (effect): Step => ({
      effect,
      timed: timedOf(plan, scene, effect),
    })),
    Order.mapInput(Order.Number, (step: Step) => step.timed?.fireFrame ?? 0)
  );

/** The step of the nearest `show` or `focus` at or before `frame`, if any. */
const stepBefore = (
  steps: readonly Step[],
  frame: number | undefined
): Carrier => {
  const before = Arr.filter(
    steps,
    (step) =>
      frame !== undefined &&
      step.timed !== undefined &&
      step.timed.fireFrame <= frame
  );

  const last = before.at(-1);

  return last === undefined
    ? { kind: "alone" }
    : { effectId: last.effect.id, kind: "step" };
};

const carrierOf = (
  plan: PlanJson,
  scene: Scene,
  steps: readonly Step[],
  sound: Effect,
  depth: number
): Carrier => {
  const { when } = sound;
  const frame = timedOf(plan, scene, sound)?.fireFrame;

  if ("absoluteMs" in when) {
    return stepBefore(steps, frame);
  }

  const { anchor } = when;

  switch (anchor.kind) {
    case "transition": {
      return { kind: "slide" };
    }

    case "scene": {
      return anchor.edge === "start"
        ? { kind: "slide" }
        : stepBefore(steps, frame);
    }

    case "element": {
      const shown = Arr.findFirst(
        scene.effects,
        (effect) => effect.verb === "show" && effect.target === anchor.id
      );

      return anchor.event === "enter" && Option.isSome(shown)
        ? { effectId: shown.value.id, kind: "step" }
        : { kind: "slide" };
    }

    case "effect": {
      const other = effectOf(scene, anchor.id);

      if (other === undefined || depth > scene.effects.length) {
        return stepBefore(steps, frame);
      }

      return isStep(other)
        ? { effectId: other.id, kind: "step" }
        : carrierOf(plan, scene, steps, other, depth + 1);
    }

    case "word": {
      return stepBefore(steps, frame);
    }

    default: {
      return { kind: "alone" };
    }
  }
};

/** Every sound of a Scene with the step or slide it plays with, in source order. */
export const soundsOf = (
  plan: PlanJson,
  scene: Scene
): readonly CarriedSound[] => {
  const steps = stepsOf(plan, scene);

  return Arr.map(
    Arr.filter(scene.effects, (effect) => !isStep(effect)),
    (effect): CarriedSound => ({
      carrier: carrierOf(plan, scene, steps, effect, 0),
      effect,
      timed: timedOf(plan, scene, effect),
    })
  );
};

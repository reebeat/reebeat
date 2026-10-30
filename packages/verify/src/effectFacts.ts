// The effects of a build as F1 reads them: each INSTANCE of an effect in the Timeline with its Plan effect, and what
// the picture can show of it: its own change (`ownSubject`) and, for a focus ring that ends by its own `until`, the end
// of the ring (`ringPlanOf`). What an effect is anchored to is an event expression: `leaves.ts` observes its sources.
// Pure: no decoding here.
import type {
  Effect as PlanEffect,
  Scene,
  TimedEffect,
  TimedPlan,
  TimedScene,
} from "@tsukuri/core";
import { Array as Arr, Option } from "effect";

import type { Subject } from "./events.ts";

/** One effect instance with everything F1 needs to find it again. */
export interface EffectFact {
  readonly effect: PlanEffect;
  readonly scene: Scene;
  readonly sceneIndex: number;
  readonly timed: TimedEffect;
  readonly timedScene: TimedScene;
}

/** The instances of the Timeline in order, each with its Plan effect. */
export const effectFacts = (plan: TimedPlan): readonly EffectFact[] =>
  Arr.flatMap(plan.timeline.scenes, (timedScene, sceneIndex) => {
    const scene = plan.scenes[sceneIndex];

    return scene === undefined
      ? []
      : Arr.flatMap(timedScene.effects, (timed) =>
          Option.match(
            Arr.findFirst(
              scene.effects,
              (effect) => effect.id === timed.effectId
            ),
            {
              onNone: () => [],
              onSome: (effect) => [
                { effect, scene, sceneIndex, timed, timedScene },
              ],
            }
          )
        );
  });

/** The key of instance `instance` of effect `effectId` of Scene `sceneId`: `scene.effect#instance`. */
export const instanceKey = (
  sceneId: string,
  effectId: string,
  instance: number
): string => `${sceneId}.${effectId}#${instance}`;

/** The id the Timeline and the checks use for an effect instance: `scene.effect#instance` (instances count from 1). */
export const effectKey = (fact: EffectFact): string =>
  instanceKey(fact.scene.id, fact.effect.id, fact.timed.instance);

/** The observation of the effect's own change: a `show` or `focus` step in its target's cell. */
export const ownSubject = (fact: EffectFact): Subject | undefined =>
  fact.effect.verb === "sound" || fact.effect.target === undefined
    ? undefined
    : {
        fireFrame: fact.timed.fireFrame,
        id: fact.effect.target,
        kind: "step",
        sceneIndex: fact.sceneIndex,
      };

/**
 * What the picture can say of where a focus ring ends (spec 0004, F5), by how the Timeline says the focus ended
 * (`TimedEffect.endedBy`):
 * - `none`: the effect has no ring (a `sound`, a `show`);
 * - `slide-change`: the ring lasts to the slide change, which F7 observes, and no cell shows it apart from that;
 * - `observe`: the ring ends in its target's cell, by its own `until` (`until`) or because a later `focus` of ANOTHER
 *   Element took the one ring over (`replaced`: its end is that focus's fire frame); the cell shows the ring leaving;
 * - `retaken`: a later `focus` rings the SAME Element again, so the ring never leaves its cell: there is no end to see
 *   (the Deck's end step is a no-op there and the Timeline has no end step for it).
 */
export type RingPlan =
  | { readonly tag: "none" }
  | { readonly tag: "slide-change" }
  | { readonly by: string; readonly frame: number; readonly tag: "retaken" }
  | { readonly tag: "observe"; readonly subject: Subject };

const noRing: RingPlan = { tag: "none" };

/** The later `focus` of the Scene whose start is at `frame`: the one that took the ring over. */
const takerAt = (
  fact: EffectFact,
  facts: readonly EffectFact[],
  frame: number
): Option.Option<EffectFact> =>
  Arr.findFirst(
    facts,
    (other) =>
      other.sceneIndex === fact.sceneIndex &&
      other.effect.verb === "focus" &&
      other.timed.fireFrame === frame &&
      other !== fact
  );

/** What the picture says of the end of the ring of `fact`; `facts` are the instances of the Timeline. */
export const ringPlanOf = (
  fact: EffectFact,
  facts: readonly EffectFact[]
): RingPlan => {
  const { effect, timed } = fact;
  const { endFrame, endedBy } = timed;

  if (
    effect.verb !== "focus" ||
    effect.target === undefined ||
    endFrame === null
  ) {
    return noRing;
  }

  if (endedBy === "slide-change") {
    return { tag: "slide-change" };
  }

  const { target } = effect;

  const observe: RingPlan = {
    subject: {
      endFrame,
      id: target,
      kind: "ring-end",
      sceneIndex: fact.sceneIndex,
    },
    tag: "observe",
  };

  if (endedBy !== "replaced") {
    return observe;
  }

  return Option.match(takerAt(fact, facts, endFrame), {
    onNone: (): RingPlan => observe,
    onSome: (other): RingPlan =>
      other.effect.target === target
        ? { by: effectKey(other), frame: endFrame, tag: "retaken" }
        : observe,
  });
};

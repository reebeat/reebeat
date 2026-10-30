// The effects of a build as F1 reads them: each effect of the Plan with its resolved frames from the Timeline, what
// it is anchored to, and which part of the picture or the track shows that anchor. Pure: no decoding here.
import type {
  Anchor,
  Effect as PlanEffect,
  Point,
  Scene,
  TimedEffect,
  TimedPlan,
  TimedScene,
} from "@tsukuri/core";
import { showEffectOf } from "@tsukuri/core";
import { Array as Arr, Option } from "effect";

import type { Subject } from "./events.ts";

/** One effect with everything F1 needs to find it again. */
export interface EffectFact {
  readonly effect: PlanEffect;
  readonly scene: Scene;
  readonly sceneIndex: number;
  readonly timed: TimedEffect;
  readonly timedScene: TimedScene;
}

/** The effects of the Timeline in order, each with its Plan effect. */
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

/** The id the Timeline and the checks use for an effect: its Scene and its own id. */
export const effectKey = (fact: EffectFact): string =>
  `${fact.scene.id}.${fact.effect.id}`;

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

/** What an anchor looks at in the picture: a subject and how to read a point of it, or why there is none. */
export type AnchorSource =
  /** A word of the narration, or the end of the video: the frame is the Timeline's (F8 observes the Lines' onsets). */
  | { readonly kind: "timeline" }
  /** Frame 0, the first picture of the video: nothing to observe. */
  | { readonly kind: "video-start" }
  /** An event of the picture; `shift` frames are added to what is read (`scene.end` is the frame before the next change). */
  | {
      readonly kind: "event";
      readonly point: Point;
      readonly shift: number;
      readonly subject: Subject;
    }
  /** Another effect of the Scene: its own observed start or end. */
  | {
      readonly edge: "end" | "start";
      readonly id: string;
      readonly kind: "effect";
    };

const eventSource = (
  subject: Subject,
  point: Point,
  shift = 0
): AnchorSource => ({ kind: "event", point, shift, subject });

const transitionOf = (sceneIndex: number, point: Point): AnchorSource =>
  sceneIndex === 0
    ? { kind: "video-start" }
    : eventSource({ kind: "transition", sceneIndex }, point);

/** The timed `show` effect of the Scene that reveals Element `id`, when the Element starts hidden. */
const revealer = (fact: EffectFact, id: string): Option.Option<TimedEffect> =>
  Option.flatMap(Option.fromNullishOr(showEffectOf(fact.scene, id)), (show) =>
    Arr.findFirst(
      fact.timedScene.effects,
      (timed) => timed.effectId === show.id
    )
  );

const elementSource = (
  fact: EffectFact,
  anchor: Extract<Anchor, { readonly kind: "element" }>
): AnchorSource => {
  const element = Arr.findFirst(
    fact.scene.elements,
    ({ id }) => id === anchor.id
  );

  const shown = Option.exists(element, ({ visible }) => !visible)
    ? revealer(fact, anchor.id)
    : Option.none();

  if (anchor.event === "enter" && Option.isSome(shown)) {
    return eventSource(
      {
        fireFrame: shown.value.fireFrame,
        id: anchor.id,
        kind: "step",
        sceneIndex: fact.sceneIndex,
      },
      anchor.at
    );
  }

  return eventSource(
    {
      event: anchor.event,
      id: anchor.id,
      kind: "element",
      sceneIndex: fact.sceneIndex,
    },
    anchor.at
  );
};

const sceneSource = (
  anchor: Extract<Anchor, { readonly kind: "scene" }>,
  sceneIndex: number,
  sceneCount: number
): AnchorSource => {
  if (anchor.edge === "start") {
    return transitionOf(sceneIndex, "start");
  }

  // The Scene's last frame is the one before the next slide change; after the last Scene the video just ends.
  return sceneIndex + 1 >= sceneCount
    ? { kind: "timeline" }
    : eventSource(
        { kind: "transition", sceneIndex: sceneIndex + 1 },
        "start",
        -1
      );
};

/** Where the picture (or another effect) shows the anchor of `fact`. */
export const anchorSource = (
  fact: EffectFact,
  sceneCount: number
): AnchorSource => {
  const { when } = fact.effect;
  const { sceneIndex } = fact;

  if ("absoluteMs" in when) {
    return transitionOf(sceneIndex, "start");
  }

  const { anchor } = when;

  if (anchor.kind === "scene") {
    return sceneSource(anchor, sceneIndex, sceneCount);
  }

  if (anchor.kind === "transition") {
    return transitionOf(sceneIndex, anchor.at);
  }

  if (anchor.kind === "element") {
    return elementSource(fact, anchor);
  }

  if (anchor.kind === "effect") {
    return { edge: anchor.edge, id: anchor.id, kind: "effect" };
  }

  return { kind: "timeline" };
};

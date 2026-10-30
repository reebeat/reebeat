// Two rules over the events of a Scene (spec 0004, F8: nonsense is a lint error). Both read only the Plan's intent (the
// `EventExpr` of each effect and of each `let`), so they need no speech timing.
//
// - `derived-event-never-used`: a `let` that no effect names, directly or through another `let` that some effect names,
//   is dead weight in the source (and a reviewer reading `plan --timing` sees a frame list that moves nothing).
// - `until-is-its-own-fire`: an `until` written as the very event the effect fires at. `until` is the first occurrence
//   strictly AFTER the fire frame, so such an end can never come and the ring would last to the end of the Scene, which
//   is what leaving `until` out says.
import { formatEvent, refsOf } from "@tsukuri/core";
import type {
  DerivedEvent,
  Effect as PlanEffect,
  EventExpr,
  PlanJson,
  Scene,
} from "@tsukuri/core";
import { Array as Arr } from "effect";

import type { Diagnostic } from "./diagnostic.ts";

export const derivedEventNeverUsedRule = "derived-event-never-used";

export const untilIsItsOwnFireRule = "until-is-its-own-fire";

/** The events an effect is written with: its `at` (unless absolute) and its `until`. */
const eventsOf = (effect: PlanEffect): readonly EventExpr[] =>
  Arr.flatMap(
    [
      "absoluteFlicks" in effect.when ? undefined : effect.when.event,
      effect.until?.event,
    ],
    (event) => (event === undefined ? [] : [event])
  );

/** The `let` names a Scene's effects use, and every name those `let`s use in turn. */
const usedNames = (
  scene: Scene,
  pending: readonly string[],
  seen: readonly string[]
): readonly string[] => {
  const fresh = Arr.dedupe(
    Arr.filter(pending, (name) => !Arr.contains(seen, name))
  );

  return fresh.length === 0
    ? seen
    : usedNames(
        scene,
        Arr.flatMap(
          Arr.filter(scene.events, (derived) =>
            Arr.contains(fresh, derived.name)
          ),
          (derived: DerivedEvent) => refsOf(derived.event)
        ),
        [...seen, ...fresh]
      );
};

/** An error for each `let` of a Scene that no effect uses. */
export const derivedEventsNeverUsed = (plan: PlanJson): readonly Diagnostic[] =>
  Arr.flatMap(plan.scenes, (scene) => {
    const used = usedNames(
      scene,
      Arr.flatMap(scene.effects, (effect) =>
        Arr.flatMap(eventsOf(effect), refsOf)
      ),
      []
    );

    return Arr.flatMap(scene.events, (derived): readonly Diagnostic[] =>
      Arr.contains(used, derived.name)
        ? []
        : [
            {
              line: derived.line,
              message: `scene ${scene.id}: the derived event ${derived.name} (${formatEvent(derived.event)}) is never used; name it in an effect's at or until, or delete the let`,
              rule: derivedEventNeverUsedRule,
              sceneId: scene.id,
            },
          ]
    );
  });

/** An error for each effect whose `until` is the event it fires at. */
export const untilsOfTheirOwnFire = (plan: PlanJson): readonly Diagnostic[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.flatMap(scene.effects, (effect): readonly Diagnostic[] =>
      effect.until !== undefined &&
      !("absoluteFlicks" in effect.when) &&
      formatEvent(effect.until.event) === formatEvent(effect.when.event)
        ? [
            {
              line: effect.line,
              message: `scene ${scene.id}, effect ${effect.id}: until ${formatEvent(effect.until.event)} is the event it fires at, and until takes the first occurrence after the fire frame, so it never ends the effect; name a later event or leave until out`,
              rule: untilIsItsOwnFireRule,
              sceneId: scene.id,
            },
          ]
        : []
    )
  );

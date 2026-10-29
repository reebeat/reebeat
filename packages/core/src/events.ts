// Which lifecycle events of an Element happen in a Scene (spec 0002, "plan contract for effects"). They come from the
// identity diff of the Plan and, for an Element that starts hidden, from its `show` effect. `RendererLifecycle` says
// WHEN each kind happens; this file only says WHICH kind it is. Plain functions.
import { Array as Arr, Option } from "effect";

import { elementOf } from "./lookup.ts";
import type { Effect, ElementEvent, Scene } from "./plan.ts";

/**
 * - `matched`: in both Scenes of an Auto-Animate change: `move` and `update` have a window;
 * - `unmatched-enter`: only in this Scene of an Auto-Animate change: it fades in over the declared window;
 * - `exit`: only in the previous Scene, seen at the transition: an instant;
 * - `slide-enter`: an Element of a Scene that is not Auto-Animate: it comes with the slide;
 * - `show-enter`: an Element that starts hidden, revealed by its `show` effect.
 */
export type EventKind =
  | "matched"
  | "unmatched-enter"
  | "exit"
  | "slide-enter"
  | "show-enter";

/** The `show` effect of an Element, if the Scene has one. */
export const showEffectOf = (scene: Scene, id: string): Effect | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(
      scene.effects,
      (effect) => effect.verb === "show" && effect.target === id
    )
  );

const changesOf = (scene: Scene, id: string): readonly string[] =>
  Option.match(
    Arr.findFirst(scene.identity?.update ?? [], (change) => change.id === id),
    { onNone: () => [], onSome: (found) => found.changes }
  );

/** The kind of `event` for a visible Element of a Scene. */
const visibleKind = (
  scene: Scene,
  id: string,
  event: ElementEvent
): EventKind | undefined => {
  if (event === "enter") {
    if (scene.identity === null) {
      return "slide-enter";
    }

    return scene.identity.enter.includes(id) ? "unmatched-enter" : undefined;
  }

  const changes = changesOf(scene, id);

  const happens =
    event === "move"
      ? changes.includes("cell")
      : changes.includes("class") || changes.includes("text");

  return happens ? "matched" : undefined;
};

/** The kind of `event` for the Element `id` in `scene`; `undefined` when the event does not happen there. */
export const eventKind = (
  scene: Scene,
  id: string,
  event: ElementEvent
): EventKind | undefined => {
  if (event === "exit") {
    return scene.identity?.exit.includes(id) === true ? "exit" : undefined;
  }

  const element = elementOf(scene, id);

  if (element === undefined) {
    return undefined;
  }

  if (element.visible) {
    return visibleKind(scene, id, event);
  }

  return event === "enter" && showEffectOf(scene, id) !== undefined
    ? "show-enter"
    : undefined;
};

/**
 * Whether the kind has a window whatever the renderer declares: percent points and percent offsets need one. A
 * `default` fade has a window and a `cut` has none; the renderer's declared duration decides the rest at schedule.
 */
export const hasWindow = (scene: Scene, kind: EventKind): boolean =>
  Arr.contains(["matched", "show-enter", "unmatched-enter"], kind) ||
  (kind === "slide-enter" && scene.transition === "default");

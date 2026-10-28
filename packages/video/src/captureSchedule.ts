// The commands the capture runs, frame by frame (spec 0001, Revision "M0 measured: the clock decides the
// mechanism"). Under the virtual clock the first visibly changed frame follows the Reveal call by a fixed lag:
//
//   Reveal.slide for an Auto-Animate scene change  2 frames (Reveal starts it in a requestAnimationFrame)
//   Reveal.slide for any other scene change        1 frame  (a fade or a cut; a CSS transition starts next frame)
//   Reveal.nextFragment for a Cue                  1 frame  (the Plan's `commandFrame` already holds it)
//
// so a Scene's slide change is commanded `lag` frames before its `slideFrame`, and a fragment at its Cue's
// `commandFrame`. A fragment step is the same call for every Cue: the Nth step shows the Nth fragment. The
// commands of one Scene are therefore kept in Cue order: a Cue whose own command frame is later than a following
// Cue's (an `sfx` at `fireFrame` followed by a `next` at `fireFrame - 1`) is commanded no later than that Cue.
import { Array as Arr, Order } from "effect";

import type { TimedPlan } from "./timedPlan.ts";

export type CaptureCommand =
  | { readonly kind: "goToScene"; readonly sceneId: string }
  | { readonly kind: "stepFragment" };

export interface ScheduledCommand {
  readonly command: CaptureCommand;
  readonly frame: number;
  /** The Scene id for a slide change, the Cue id for a fragment step. */
  readonly source: string;
}

export interface CaptureSchedule {
  readonly commands: readonly ScheduledCommand[];
  readonly fps: number;
  readonly totalFrames: number;
}

/** Frames between `Reveal.slide` and the first changed frame of an Auto-Animate transition. */
export const autoAnimateLag = 2;

/** Frames between `Reveal.slide` and the first changed frame of a fade or a cut. */
export const sceneChangeLag = 1;

const byFrame = Order.mapInput(
  Order.Number,
  (step: ScheduledCommand) => step.frame
);

/** Each Scene's fragment steps, in Cue order, each no later than any step after it. */
const fragmentSteps = (
  plan: TimedPlan
): ReadonlyMap<string, readonly ScheduledCommand[]> =>
  new Map(
    Arr.map(
      plan.timeline.scenes,
      (scene): [string, readonly ScheduledCommand[]] => {
        const own = Arr.map(
          Arr.flatMap(scene.lines, (line) => line.cues),
          (cue): ScheduledCommand => ({
            command: { kind: "stepFragment" },
            frame: cue.commandFrame,
            source: cue.cueId,
          })
        );

        // The smallest command frame at or after each position: a step never runs after a later Cue's step.
        return [
          scene.sceneId,
          Arr.map(own, (step, index) => ({
            ...step,
            frame: Math.min(
              ...Arr.map(Arr.drop(own, index), (later) => later.frame)
            ),
          })),
        ];
      }
    )
  );

const slideChange = (
  plan: TimedPlan
): ((sceneId: string, slideFrame: number) => ScheduledCommand) => {
  const transitions = new Map(
    Arr.map(plan.scenes, (scene): [string, string] => [
      scene.id,
      scene.transition,
    ])
  );

  return (sceneId, slideFrame) => ({
    command: { kind: "goToScene", sceneId },
    frame:
      slideFrame -
      (transitions.get(sceneId) === "auto-animate"
        ? autoAnimateLag
        : sceneChangeLag),
    source: sceneId,
  });
};

/** Every command of the capture, sorted by frame; commands of one frame keep their order in the story. */
export const captureSchedule = (plan: TimedPlan): CaptureSchedule => {
  const slideChangeFor = slideChange(plan);
  const fragments = fragmentSteps(plan);

  const ordered = Arr.flatMap(plan.timeline.scenes, (timed, index) => [
    ...(index === 0 ? [] : [slideChangeFor(timed.sceneId, timed.slideFrame)]),
    ...(fragments.get(timed.sceneId) ?? []),
  ]);

  return {
    commands: Arr.sort(ordered, byFrame),
    fps: plan.settings.fps,
    totalFrames: plan.timeline.totalFrames,
  };
};

import type { Scene } from "@reebeat/core";
// The commands the capture runs, frame by frame (spec 0001, Revision "M0 measured: the clock decides the
// mechanism", corrected by the measurement on the real deck below). Per frame the capture steps the virtual clock,
// then runs the commands of that frame, then seeks the animations and takes the screenshot. A Reveal call at frame c
// therefore shows its effect from frame c + lag, where the lag is how many frames after the call the first pixel of
// the WHOLE frame differs (more than 8 grey levels in at least 200 pixels):
//
//   scene change, Auto-Animate  0  Reveal.slide swaps the slide synchronously: the unmatched Elements enter and
//                                  leave at once. Only the matched Element's motion waits for a requestAnimationFrame
//                                  (the transition itself then lasts 24 frames from the call)
//   scene change, cut           0  `data-transition="none"` swaps the slide synchronously
//   scene change, default fade  1  the fade is a CSS transition that starts on the next frame
//   fragment, `next`            1  the hidden Element fades in by a CSS transition
//   fragment, `focus`           1  a ring and a scale by a CSS transition; the first sub-pixel change of a `.box`
//                                  (a compositor layer is promoted) shows at the call, hence the +-1 frame of F1
//   fragment, `sfx`             -  no pixel changes; the sound is mixed at `fireFrame`
//
// so a Scene's slide change is commanded `lag` frames before its `slideFrame` and a fragment at its Cue's
// `commandFrame` (`fireFrame - 1` for next and focus, `fireFrame` for sfx). A fragment step is the same call for
// every Cue: the Nth step shows the Nth fragment. The commands of one Scene are therefore kept in Cue order: a Cue
// whose own command frame is later than a following Cue's (an `sfx` at `fireFrame` followed by a `next` at
// `fireFrame - 1`) is commanded no later than that Cue.
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
  /** The viewport of the capture: the Plan's `settings.height`. */
  readonly height: number;
  readonly totalFrames: number;
  /** The viewport of the capture: the Plan's `settings.width`. */
  readonly width: number;
}

/** Frames between `Reveal.slide` and the first changed frame of the whole frame, by the transition INTO the Scene. */
export const sceneChangeLag = {
  "auto-animate": 0,
  cut: 0,
  default: 1,
} as const;

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
    Arr.map(plan.scenes, (scene): [string, Scene["transition"]] => [
      scene.id,
      scene.transition,
    ])
  );

  return (sceneId, slideFrame) => ({
    command: { kind: "goToScene", sceneId },
    frame: slideFrame - sceneChangeLag[transitions.get(sceneId) ?? "default"],
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
    height: plan.settings.height,
    totalFrames: plan.timeline.totalFrames,
    width: plan.settings.width,
  };
};

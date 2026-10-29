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
//   fragment, `show`            1  the hidden Element fades in by a CSS transition
//   fragment, `focus`, start    1  a ring and a scale by a CSS transition; the first sub-pixel change of a `.box`
//                                  (a compositor layer is promoted) shows at the call, hence the +-1 frame of F1
//   fragment, `focus`, end      1  the same transition the other way: the ring and the scale leave by a CSS transition
//   sound                       -  no pixel changes and no command; the sound is mixed at `fireFrame`
//
// so a Scene's slide change is commanded `lag` frames before its `slideFrame`, a fragment step at the command frame
// the Timeline gives it: a start at its effect's `commandFrame` (`fireFrame - 1`), an END step of a `focus` whose ring
// ends by its own `until` at its `endCommandFrame` (`endFrame - 1`: the ring's last frame is `endFrame`). Which steps a
// Scene has, and in which order, is `stepsOf` of `@reebeat/core`, the one definition the Deck (`@reebeat/render-reveal`)
// and the verifier share: the Nth step shows the Nth fragment of the Deck, so the steps are commanded in that order
// (the command frames follow the step frames, a start before an end in one frame). Only `show` and `focus` effects are
// steps: a `sound` is mixed at each instance's `fireFrame` and needs no command, however many instances it has. A step
// is never commanded before its Scene's own slide change (an effect at `transition.start` has its command frame one
// before the slide frame: stepping then would step the PREVIOUS slide), so it is commanded at the slide change instead
// and appears one frame after its fire frame, inside the tolerance of F1.
//
// The lags are frames at `capturedFps`: that is the only frame rate they were measured at, and the capture refuses
// another (`unsupportedRate`) rather than render a video whose timing is wrong.
import { stepsOf } from "@reebeat/core";
import type { Scene, Settings, TimedPlan, TimedScene } from "@reebeat/core";
import { Array as Arr, Option, Order } from "effect";

export type CaptureCommand =
  | { readonly kind: "goToScene"; readonly sceneId: string }
  | { readonly kind: "stepFragment" };

export interface ScheduledCommand {
  readonly command: CaptureCommand;
  /** For a fragment step: whether it starts the effect or ends a `focus` ring; a slide change has none. */
  readonly edge: "end" | "start" | null;
  readonly frame: number;
  /** The Scene id for a slide change, the effect id for a fragment step. */
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

/** The frame rate the lags of this file were measured at, and the only one the capture renders. */
export const capturedFps = 30;

/** Frames between `Reveal.slide` and the first changed frame of the whole frame, by the transition INTO the Scene. */
export const sceneChangeLag = {
  "auto-animate": 0,
  cut: 0,
  default: 1,
} as const;

/**
 * Why the capture cannot render a Plan's frame rate, or undefined: its lags were measured at `capturedFps` and a
 * frame is a whole 1/`capturedFps` s, so another nominal rate, or the 1000/1001 fraction of one, would shift every
 * command by a fraction of a frame.
 */
export const unsupportedRate = (
  settings: Pick<Settings, "fps" | "ntsc">
): string | undefined =>
  settings.fps === capturedFps && !settings.ntsc
    ? undefined
    : `the capture renders settings.fps ${capturedFps} with settings.ntsc false (its lags were measured at ${capturedFps} fps), the Plan has settings.fps ${settings.fps} and settings.ntsc ${settings.ntsc}`;

const byFrame = Order.mapInput(
  Order.Number,
  (step: ScheduledCommand) => step.frame
);

/**
 * The fragment steps of one Scene, `stepsOf` order, none before `notBefore`: a start at its command frame, an end at its
 * end command frame. A step with no Timeline entry, or an end with no end command frame, is not a step of this Plan:
 * `requireTimeline` has checked the Timeline against the Scenes.
 */
const fragmentSteps = (
  plan: TimedPlan,
  scene: Scene,
  notBefore: number
): readonly ScheduledCommand[] =>
  Arr.flatMap(stepsOf(plan, scene), ({ edge, effect, timed }) => {
    const frame =
      edge === "start" ? timed?.commandFrame : timed?.endCommandFrame;

    return frame === undefined || frame === null
      ? []
      : [
          {
            command: { kind: "stepFragment" },
            edge,
            frame: Math.max(frame, notBefore),
            source: effect.id,
          },
        ];
  });

/** The commands of one Scene: its slide change (none for the first Scene) and its fragment steps. */
const sceneCommands = (
  plan: TimedPlan,
  scene: Scene,
  { sceneId, slideFrame }: TimedScene,
  index: number
): readonly ScheduledCommand[] => {
  if (index === 0) {
    return fragmentSteps(plan, scene, 0);
  }

  const change: ScheduledCommand = {
    command: { kind: "goToScene", sceneId },
    edge: null,
    frame: slideFrame - sceneChangeLag[scene.transition],
    source: sceneId,
  };

  return [change, ...fragmentSteps(plan, scene, change.frame)];
};

/** Every command of the capture, sorted by frame; commands of one frame keep their order in the story. */
export const captureSchedule = (plan: TimedPlan): CaptureSchedule => {
  const ordered = Arr.flatMap(plan.timeline.scenes, (timed, index) =>
    Option.match(
      Arr.findFirst(plan.scenes, (scene) => scene.id === timed.sceneId),
      {
        onNone: () => [],
        onSome: (scene) => sceneCommands(plan, scene, timed, index),
      }
    )
  );

  return {
    commands: Arr.sort(ordered, byFrame),
    fps: plan.settings.fps,
    height: plan.settings.height,
    totalFrames: plan.timeline.totalFrames,
    width: plan.settings.width,
  };
};

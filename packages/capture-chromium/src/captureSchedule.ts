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
//   fragment, `focus`           1  a ring and a scale by a CSS transition; the first sub-pixel change of a `.box`
//                                  (a compositor layer is promoted) shows at the call, hence the +-1 frame of F1
//   sound                       -  no pixel changes and no command; the sound is mixed at `fireFrame`
//
// so a Scene's slide change is commanded `lag` frames before its `slideFrame` and a fragment step at its effect's
// `commandFrame` (`fireFrame - 1`). Only `show` and `focus` effects are steps: a `sound` is mixed at its `fireFrame`
// and needs no command. A step is the same call for every effect: the Nth step shows the Nth fragment, and the
// fragments are the Scene's `show` and `focus` effects in resolved-time order (`@reebeat/render-reveal`), which is the
// order of `Timeline.scenes[].effects`, so the steps are commanded in that order. A step is never commanded before
// its Scene's own slide change (an effect at `transition.start` has its command frame one before the slide frame:
// stepping then would step the PREVIOUS slide), so it is commanded at the slide change instead and appears one frame
// after its fire frame, inside the tolerance of F1.
import type { Scene, TimedPlan, TimedScene } from "@reebeat/core";
import { Array as Arr, Option, Order } from "effect";

export type CaptureCommand =
  | { readonly kind: "goToScene"; readonly sceneId: string }
  | { readonly kind: "stepFragment" };

export interface ScheduledCommand {
  readonly command: CaptureCommand;
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

/** The effects of Scene `sceneId` that are sounds, by effect id: ids are unique per Scene, not in the story. */
const soundsOf = (plan: TimedPlan, sceneId: string): ReadonlySet<string> =>
  new Set(
    Option.match(
      Arr.findFirst(plan.scenes, (scene) => scene.id === sceneId),
      {
        onNone: () => [],
        onSome: (scene) =>
          Arr.flatMap(scene.effects, (effect) =>
            effect.verb === "sound" ? [effect.id] : []
          ),
      }
    )
  );

/** The fragment steps of one Scene: one per `show` or `focus` effect, in resolved-time order, none before `notBefore`. */
const fragmentSteps = (
  scene: TimedScene,
  sounds: ReadonlySet<string>,
  notBefore: number
): readonly ScheduledCommand[] =>
  Arr.flatMap(scene.effects, (effect) =>
    sounds.has(effect.effectId)
      ? []
      : [
          {
            command: { kind: "stepFragment" },
            frame: Math.max(effect.commandFrame, notBefore),
            source: effect.effectId,
          },
        ]
  );

const slideChange = (
  plan: TimedPlan
): ((scene: TimedScene) => ScheduledCommand) => {
  const transitions = new Map(
    Arr.map(plan.scenes, (scene): [string, Scene["transition"]] => [
      scene.id,
      scene.transition,
    ])
  );

  return ({ sceneId, slideFrame }) => ({
    command: { kind: "goToScene", sceneId },
    frame: slideFrame - sceneChangeLag[transitions.get(sceneId) ?? "default"],
    source: sceneId,
  });
};

/** Every command of the capture, sorted by frame; commands of one frame keep their order in the story. */
export const captureSchedule = (plan: TimedPlan): CaptureSchedule => {
  const slideChangeFor = slideChange(plan);

  const ordered = Arr.flatMap(plan.timeline.scenes, (timed, index) => {
    const change = index === 0 ? undefined : slideChangeFor(timed);

    return [
      ...(change === undefined ? [] : [change]),
      ...fragmentSteps(
        timed,
        soundsOf(plan, timed.sceneId),
        change?.frame ?? 0
      ),
    ];
  });

  return {
    commands: Arr.sort(ordered, byFrame),
    fps: plan.settings.fps,
    height: plan.settings.height,
    totalFrames: plan.timeline.totalFrames,
    width: plan.settings.width,
  };
};

// F1, the sound that goes with a motion: an `sfx` Cue the Plan anchors to a transition start (`anchor:
// "transition-start"`, written before the first word of the first Line of a Scene) must sound when the picture starts to
// change, not only where the Timeline says. The sound onset found in the decoded track is compared with the first
// changed frame of the scene change into that Scene in the decoded video (the observation F7 makes), within one frame.
// The comparison with the Cue's own planned `fireFrame` is F1's ordinary sound check; the two together catch a Timeline
// that is consistent with itself but puts the sound somewhere else than the motion (the whoosh that fired at the end of
// its sentence, 113 frames after the box had started to move).
import type { TimedPlan } from "@reebeat/core";
import { Array as Arr, Effect, Option } from "effect";

import type { Build } from "./load.ts";
import { observeSceneChanges } from "./sceneChanges.ts";
import { signedFrames, withinOneFrame } from "./units.ts";
import type { Measured } from "./verdict.ts";

export interface MotionAnchor {
  /** The Scene whose slide change the Cue is anchored to. */
  readonly sceneId: string;
  /** The Scene's `slideFrame` in the Timeline. */
  readonly slideFrame: number;
  /** The first Scene has no slide change to observe (its picture is the first frame of the video). */
  readonly first: boolean;
}

/** The slide change Cue `cueId` is anchored to, or none for a Cue that is not anchored to a transition start. */
export const motionAnchorOf = (
  plan: TimedPlan,
  cueId: string
): Option.Option<MotionAnchor> =>
  Option.flatMap(
    Arr.findFirstIndex(plan.scenes, (scene) =>
      Arr.some(scene.lines, (line) =>
        Arr.some(
          line.cues,
          (cue) => cue.id === cueId && cue.anchor === "transition-start"
        )
      )
    ),
    (index) =>
      Option.flatMap(
        Option.all({
          planned: Arr.get(plan.scenes, index),
          timed: Arr.get(plan.timeline.scenes, index),
        }),
        ({ planned, timed }) =>
          planned.id === timed.sceneId
            ? Option.some({
                first: index === 0,
                sceneId: planned.id,
                slideFrame: timed.slideFrame,
              })
            : Option.none()
      )
  );

export interface MotionInput {
  readonly anchor: MotionAnchor;
  readonly cueId: string;
  readonly fireFrame: number;
  /** What F1 prints for the Cue: its id, kind and fire frame. */
  readonly label: string;
  /** Per Scene after the first: the first changed frame minus its slide frame (`observeSceneChanges`). */
  readonly changes: ReadonlyMap<string, number | undefined>;
  /** The sound onset minus the Cue's `fireFrame`, or undefined when the sound was not found. */
  readonly soundFrames: number | undefined;
}

export interface MotionResult {
  readonly measured: Measured;
  readonly problems: readonly string[];
}

/** How far the sound starts from the first changed frame of its scene change, and the problem when that is over a frame. */
const motionCheck = ({
  anchor,
  changes,
  cueId,
  fireFrame,
  label,
  soundFrames,
}: MotionInput): MotionResult => {
  const name = `${cueId} sfx onset vs the scene change into ${anchor.sceneId} (frames)`;
  const change = changes.get(anchor.sceneId);

  if (anchor.first) {
    return {
      measured: [[name, "none: the first Scene has no scene change"]],
      problems: [],
    };
  }

  if (change === undefined) {
    return {
      measured: [[name, "not observed"]],
      problems: [
        `${label}: the scene change into ${anchor.sceneId} is not observed, so the sound cannot be compared with it`,
      ],
    };
  }

  const changedFrame = anchor.slideFrame + change;

  if (soundFrames === undefined) {
    return { measured: [[name, "not observed"]], problems: [] };
  }

  const frames = fireFrame + soundFrames - changedFrame;

  return {
    measured: [
      [name, signedFrames(frames)],
      [`${cueId} first changed frame of that scene change`, changedFrame],
    ],
    problems: withinOneFrame(frames)
      ? []
      : [
          `${label}: the sound starts ${signedFrames(frames)} frames from the first changed frame of the scene change into ${anchor.sceneId} (frame ${changedFrame})`,
        ],
  };
};

/**
 * The motion checks of every anchored `sfx` Cue of a build. The scene changes are observed in the video only when a
 * Cue has one to be compared with (F7 observes them again for itself: the decode is a few frames per Scene).
 */
export const motionChecks = Effect.fn("motionChecks")(function* checks(
  build: Build,
  inputs: readonly Omit<MotionInput, "changes">[]
) {
  const changes = Arr.some(inputs, (input) => !input.anchor.first)
    ? (yield* observeSceneChanges(build)).offsets
    : new Map<string, number | undefined>();

  const checked = Arr.map(inputs, (input) =>
    motionCheck({ ...input, changes })
  );

  return {
    measured: Arr.flatMap(checked, (one) => one.measured),
    problems: Arr.flatMap(checked, (one) => one.problems),
  };
});

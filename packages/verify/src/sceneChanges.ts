// F7, scene-change timing: the picture changes at the slide frame of every Scene after the first. The first frame in
// the 4 frames either side of `slideFrame` that differs from the frame before it is within one frame of `slideFrame`,
// whatever the transition into the Scene (a fade, a cut, an Auto-Animate). The offset is reported per Scene.
import { Array as Arr, Effect, Option } from "effect";

import type { Build } from "./load.ts";
import { stepOffset } from "./steps.ts";
import { signedFrames, withinOneFrame } from "./units.ts";
import type { Measured } from "./verdict.ts";

/** The window of frames either side of the slide frame in which the change is looked for. */
const windowFrames = 4;

export interface SceneChanges {
  readonly measured: Measured;
  readonly problems: readonly string[];
}

/** The slide change into every Scene after the first, observed in the written video. */
export const observeSceneChanges = Effect.fn("observeSceneChanges")(
  function* changes(build: Build) {
    const later = Arr.drop(build.plan.timeline.scenes, 1);

    const offsets = yield* Effect.forEach(later, (scene) =>
      stepOffset(build.mp4, scene.slideFrame, windowFrames)
    );

    const rows = Arr.map(Arr.zip(later, offsets), ([scene, offset]) => ({
      kind: Option.match(
        Arr.findFirst(
          build.plan.scenes,
          (planned) => planned.id === scene.sceneId
        ),
        { onNone: () => "unknown", onSome: (planned) => planned.transition }
      ),
      offset,
      scene,
    }));

    const problems = Arr.flatMap(rows, ({ kind, offset, scene }) => {
      const where = `the slide change into ${scene.sceneId} (${kind})`;

      if (offset === undefined) {
        return [
          `${where} is not observed within ${windowFrames} frames of its slide frame ${scene.slideFrame}`,
        ];
      }

      return withinOneFrame(offset)
        ? []
        : [
            `${where} is observed ${signedFrames(offset)} frames from its slide frame ${scene.slideFrame}`,
          ];
    });

    const measured: Measured = Arr.map(
      rows,
      ({ kind, offset, scene }): readonly [string, string] => [
        `${scene.sceneId} ${kind} slide change offset (frames)`,
        offset === undefined ? "not observed" : signedFrames(offset),
      ]
    );

    return { measured, problems } satisfies SceneChanges;
  }
);

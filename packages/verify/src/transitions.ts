// F7, the clock covers the transitions, observed on ONE written video. Every Scene change begins at its slide frame
// (`sceneChanges.ts`). For every Scene that enters with `auto-animate`, the decoded frames from three before the slide
// change to thirty after show at least five distinct intermediate frames between the first frame and the settled one,
// and each intermediate frame is no farther from the settled frame than the one before it (the sum of absolute pixel
// differences does not rise by more than a slack). A Scene that enters with `cut` shows NO intermediate frame: from its
// first changed frame on, every frame already is the settled one (the old slide must not fade out over the new one).
//
// F7 does NOT check that two runs give the same frames: that is F6 (`compareBuilds`, on two builds). Which test covers
// what:
//   - the scene-change timing, the intermediate-frame count and the monotone approach: `test/checks.test.ts` (a scene
//     change commanded 2 frames late and early, a hard cut, a reversed transition), each failing F7 and nothing else;
//   - run-to-run identity (F6): `test/checks.test.ts` and `test/edges.test.ts` (a copy passes; one frame
//     replaced, or only the audio changed, fails naming the first differing frame or sample); the clock-jitter control (a seeded jitter of the virtual
//     clock makes two captures differ, the same jitter makes them equal) is in `packages/capture-chromium/test/capture.test.ts`;
//   - capture with the settle wait off and capture without the virtual clock are recorded manual measurements (spec
//     0001, Revision "M0 measured: the clock decides the mechanism"), not automated tests.
import { changedPixels, decodeGrayFrames } from "@reebeat/encode-ffmpeg";
import type { FrameSize } from "@reebeat/encode-ffmpeg";
import { sha256Hex } from "@reebeat/pipeline";
import { Array as Arr, Effect, Option } from "effect";

import { guarded } from "./guard.ts";
import type { Build } from "./load.ts";
import { observeSceneChanges } from "./sceneChanges.ts";
import { stepMinPixels, stepTolerance } from "./steps.ts";
import { fail, verdictOf } from "./verdict.ts";
import type { Measured } from "./verdict.ts";

/** Frames before the slide change that are decoded: the first frame of the comparison is the old slide. */
const lead = 3;

/** Frames after the slide change that are decoded: the transition (0.8 s) is over well before. */
const tail = 30;

/** The frames after the first changed frame of a cut in which the picture must already be the settled one: 0.6 s, longer than the 0.5 s fade of reveal.js and shorter than a Scene's lead. */
const cutWindowSeconds = 0.6;

/** The count of distinct intermediate frames the transition must show. */
const minIntermediate = 5;

/**
 * The approach to the settled frame is monotonic when no frame is farther from it than the frame before by more than
 * this share of the whole change (the distance of the first frame). Measured: the rise is 0.6% to 1.5% in the
 * committed story and 5.9% in the test fixture, where an Element first moves away from its settled place; a
 * transition played backwards or out of order rises by most of the whole change.
 */
const riseSlack = 0.1;

/** The sum of absolute differences of two frames. */
const absoluteDifference = (left: Uint8Array, right: Uint8Array): number => {
  let sum = 0;

  for (let index = 0; index < left.length; index += 1) {
    sum += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }

  return sum;
};

interface Transition {
  readonly distinct: number;
  readonly intermediate: number;
  /** The largest growth of the distance to the settled frame between two intermediate frames, relative to the whole change. */
  readonly largestRise: number;
  readonly sceneId: string;
}

const isIntermediate =
  (first: Uint8Array, settled: Uint8Array, width: number) =>
  (frame: Uint8Array): boolean =>
    changedPixels(frame, first, width, undefined, stepTolerance) >=
      stepMinPixels &&
    changedPixels(frame, settled, width, undefined, stepTolerance) >=
      stepMinPixels;

/** The largest increase from one value to the next; 0 when the values never increase. */
const largestRise = (values: readonly number[]): number =>
  Arr.reduce(Arr.zip(values, Arr.drop(values, 1)), 0, (most, [before, after]) =>
    Math.max(most, after - before)
  );

const observeTransition = Effect.fn("observeTransition")(function* transition(
  mp4: string,
  size: FrameSize,
  sceneId: string,
  slideFrame: number,
  lastFrame: number
) {
  const clip = yield* decodeGrayFrames(
    mp4,
    Math.max(0, slideFrame - lead),
    Math.min(lastFrame, slideFrame + tail),
    size
  );

  const [first] = clip.frames;
  const settled = Arr.last(clip.frames);

  if (first === undefined || Option.isNone(settled)) {
    return { distinct: 0, intermediate: 0, largestRise: 0, sceneId };
  }

  const between = Arr.filter(
    clip.frames,
    isIntermediate(first, settled.value, clip.width)
  );

  const hashes = yield* Effect.forEach(between, sha256Hex);

  const distances = Arr.map(between, (frame) =>
    absoluteDifference(frame, settled.value)
  );

  return {
    distinct: new Set(hashes).size,
    intermediate: between.length,
    largestRise:
      largestRise(distances) /
      Math.max(1, absoluteDifference(first, settled.value)),
    sceneId,
  } satisfies Transition;
});

const problemOf = (found: Transition): readonly string[] => [
  ...(found.distinct >= minIntermediate
    ? []
    : [
        `the transition into ${found.sceneId} shows ${found.distinct} distinct intermediate frames, at least ${minIntermediate} are needed`,
      ]),
  ...(found.largestRise <= riseSlack
    ? []
    : [
        `the transition into ${found.sceneId} does not approach its settled frame monotonically: a frame is ${Math.round(found.largestRise * 1000) / 10}% of the whole change farther from it than the frame before`,
      ]),
];

interface Cut {
  /** The frames of the first `cutWindowSeconds` after the first changed frame that are not yet the settled frame. */
  readonly intermediate: number;
  readonly sceneId: string;
}

/**
 * A `> CUT` shows no intermediate frame: from the first changed frame on, every frame is already the settled frame
 * (the frame `cutWindowSeconds` later) within the encoder's noise (`stepTolerance`, `stepMinPixels`, as everywhere).
 * The old slide fading out over the new one (reveal.js fades a leaving slide by its own style) fails it.
 */
const observeCut = Effect.fn("observeCut")(function* cut(
  build: Build,
  sceneId: string,
  changedFrame: number
) {
  const clip = yield* decodeGrayFrames(
    build.mp4,
    changedFrame,
    Math.min(
      build.plan.timeline.totalFrames - 1,
      changedFrame + Math.round(cutWindowSeconds * build.plan.settings.fps)
    ),
    build.plan.settings
  );

  const settled = Arr.last(clip.frames);

  return {
    intermediate: Option.match(settled, {
      onNone: () => 0,
      onSome: (frame) =>
        Arr.filter(
          clip.frames,
          (one) =>
            changedPixels(one, frame, clip.width, undefined, stepTolerance) >=
            stepMinPixels
        ).length,
    }),
    sceneId,
  } satisfies Cut;
});

const cutProblem = (seen: Cut): readonly string[] =>
  seen.intermediate === 0
    ? []
    : [
        `the cut into ${seen.sceneId} shows ${seen.intermediate} frames that are not yet its settled frame after its first changed frame: the old slide still fades out`,
      ];

/** F7 on the scene changes and the Auto-Animate transitions of the written video. */
export const transitions = (build: Build) =>
  guarded(
    "F7",
    Effect.gen(function* observe() {
      const cutScenes = new Set(
        Arr.flatMap(build.plan.scenes, (scene) =>
          scene.transition === "cut" ? [scene.id] : []
        )
      );

      const animated = new Set(
        Arr.flatMap(build.plan.scenes, (scene) =>
          scene.transition === "auto-animate" ? [scene.id] : []
        )
      );

      const scenes = Arr.filter(build.plan.timeline.scenes, (scene) =>
        animated.has(scene.sceneId)
      );

      const changes = yield* observeSceneChanges(build);

      // A cut is observed from its first changed frame; a cut whose change is not observed is reported by the scene
      // change check.
      const cuts = Arr.flatMap(build.plan.timeline.scenes, (scene) => {
        const offset = changes.offsets.get(scene.sceneId);

        return offset !== undefined && cutScenes.has(scene.sceneId)
          ? [
              {
                changedFrame: scene.slideFrame + offset,
                sceneId: scene.sceneId,
              },
            ]
          : [];
      });

      if (scenes.length === 0 && changes.measured.length === 0) {
        return fail("F7", "the Plan has no Scene change to observe");
      }

      const found = yield* Effect.forEach(scenes, (scene) =>
        observeTransition(
          build.mp4,
          build.plan.settings,
          scene.sceneId,
          scene.slideFrame,
          build.plan.timeline.totalFrames - 1
        )
      );

      const cutsSeen = yield* Effect.forEach(cuts, (cut) =>
        observeCut(build, cut.sceneId, cut.changedFrame)
      );

      const measured: Measured = [
        ...changes.measured,
        ...Arr.map(cutsSeen, (one): readonly [string, number] => [
          `${one.sceneId} cut intermediate frames`,
          one.intermediate,
        ]),
        ...Arr.flatMap(found, (one): Measured => [
          [`${one.sceneId} intermediate frames`, one.intermediate],
          [`${one.sceneId} distinct intermediate frames`, one.distinct],
          [
            `${one.sceneId} largest rise (% of the whole change)`,
            Math.round(one.largestRise * 1000) / 10,
          ],
        ]),
      ];

      return verdictOf(
        "F7",
        `all ${changes.measured.length} scene changes begin within one frame of their slide frame, every one of the ${found.length} auto-animate transitions shows at least ${minIntermediate} distinct intermediate frames and approaches its settled frame monotonically, and each of the ${cuts.length} cuts shows none`,
        [
          ...changes.problems,
          ...Arr.flatMap(found, problemOf),
          ...Arr.flatMap(cutsSeen, cutProblem),
        ],
        measured
      );
    })
  );

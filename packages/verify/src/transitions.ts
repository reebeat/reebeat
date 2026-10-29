// F7, the clock covers the transitions, observed on ONE written video. Every Scene change begins at its slide frame
// (`sceneChanges.ts`). For every Scene that enters with `auto-animate`, the decoded frames from three before the slide
// change to thirty after show at least five distinct intermediate frames between the first frame and the settled one,
// and each intermediate frame is no farther from the settled frame than the one before it (the sum of absolute pixel
// differences does not rise by more than a slack).
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
  /** The distance of the last intermediate frame to the settled frame minus the first's, relative to the whole change; negative when it approaches. */
  readonly netRise: number;
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
  sceneId: string,
  slideFrame: number,
  lastFrame: number
) {
  const clip = yield* decodeGrayFrames(
    mp4,
    Math.max(0, slideFrame - lead),
    Math.min(lastFrame, slideFrame + tail)
  );

  const [first] = clip.frames;
  const settled = Arr.last(clip.frames);

  if (first === undefined || Option.isNone(settled)) {
    return {
      distinct: 0,
      intermediate: 0,
      largestRise: 0,
      netRise: 0,
      sceneId,
    };
  }

  const between = Arr.filter(
    clip.frames,
    isIntermediate(first, settled.value, clip.width)
  );

  const hashes = yield* Effect.forEach(between, sha256Hex);

  const distances = Arr.map(between, (frame) =>
    absoluteDifference(frame, settled.value)
  );

  const whole = Math.max(1, absoluteDifference(first, settled.value));
  const [nearest] = distances;
  const farthest = distances.at(-1);

  return {
    distinct: new Set(hashes).size,
    intermediate: between.length,
    largestRise: largestRise(distances) / whole,
    netRise:
      nearest === undefined || farthest === undefined
        ? 0
        : (farthest - nearest) / whole,
    sceneId,
  } satisfies Transition;
});

const problemOf = (found: Transition): readonly string[] => [
  ...(found.distinct >= minIntermediate
    ? []
    : [
        `the transition into ${found.sceneId} shows ${found.distinct} distinct intermediate frames, at least ${minIntermediate} are needed`,
      ]),
  // A transition played backwards rises by a little at every frame, none of them over the slack; but it ends farther from
  // the settled frame than it began, which no approach does.
  ...(found.netRise <= 0
    ? []
    : [
        `the transition into ${found.sceneId} does not approach its settled frame monotonically: its last intermediate frame is ${Math.round(found.netRise * 1000) / 10}% of the whole change farther from it than its first`,
      ]),
  ...(found.largestRise <= riseSlack
    ? []
    : [
        `the transition into ${found.sceneId} does not approach its settled frame monotonically: a frame is ${Math.round(found.largestRise * 1000) / 10}% of the whole change farther from it than the frame before`,
      ]),
];

/** F7 on the scene changes and the Auto-Animate transitions of the written video. */
export const transitions = (build: Build) =>
  guarded(
    "F7",
    Effect.gen(function* observe() {
      const animated = new Set(
        Arr.flatMap(build.plan.scenes, (scene) =>
          scene.transition === "auto-animate" ? [scene.id] : []
        )
      );

      const scenes = Arr.filter(build.plan.timeline.scenes, (scene) =>
        animated.has(scene.sceneId)
      );

      const changes = yield* observeSceneChanges(build);

      if (scenes.length === 0 && changes.measured.length === 0) {
        return fail("F7", "the Plan has no Scene change to observe");
      }

      const found = yield* Effect.forEach(scenes, (scene) =>
        observeTransition(
          build.mp4,
          scene.sceneId,
          scene.slideFrame,
          build.plan.timeline.totalFrames - 1
        )
      );

      const measured: Measured = [
        ...changes.measured,
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
        `all ${changes.measured.length} scene changes begin within one frame of their slide frame, and every one of the ${found.length} auto-animate transitions shows at least ${minIntermediate} distinct intermediate frames and approaches its settled frame monotonically`,
        [...changes.problems, ...Arr.flatMap(found, problemOf)],
        measured
      );
    })
  );

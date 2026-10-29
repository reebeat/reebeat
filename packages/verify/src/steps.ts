// Where the picture of the written video first changes near a frame: the one observation behind F1's `next` and `focus`
// Cues and F7's scene changes. The first frame within `reach` frames either side of `center` whose pixels differ from
// the frame before it.
import {
  changedPixels,
  decodeGrayFrames,
  firstChangedFrame,
} from "@reebeat/encode-ffmpeg";
import type { Box, GrayClip } from "@reebeat/encode-ffmpeg";
import { Effect } from "effect";

/** Pixels that differ by at most this many gray levels are compression noise, not a step. */
export const stepTolerance = 8;

/**
 * A frame has a step when at least this many pixels changed by more than the tolerance. Measured: the encoder's noise
 * between two frames of a still slide is at most about 120 such pixels, the first frame of the smallest step 349.
 */
export const stepMinPixels = 200;

/**
 * The encoder flickers on the hard edge of an Element that appeared earlier: one scanline of 288 pixels changes in every
 * frame of the offline build of the committed story, which is over `stepMinPixels` and read as a step (F7 observed the
 * change into `sc7` 4 frames early). A step must change this many more pixels than the flicker already there between the
 * first two frames of the clip, which precede any event.
 */
export const flickerMargin = 100;

/** The pixels a frame must change to count as a step, given the first two frames of a clip (before any event). */
export const changeFloor = (clip: GrayClip, box?: Box): number => {
  const [before, next] = clip.frames;

  return before === undefined || next === undefined
    ? stepMinPixels
    : Math.max(
        stepMinPixels,
        changedPixels(before, next, clip.width, box, stepTolerance) +
          flickerMargin
      );
};

/**
 * The offset in frames from `center` of the first changed frame in `[center - reach, center + reach]`, or undefined.
 * With a `box` only the pixels inside it count.
 */
export const stepOffset = Effect.fn("stepOffset")(function* step(
  mp4: string,
  center: number,
  reach: number,
  box?: Box
) {
  const clip = yield* decodeGrayFrames(
    mp4,
    Math.max(0, center - reach - 1),
    center + reach
  );

  const first = firstChangedFrame(clip, box, {
    minPixels: changeFloor(clip, box),
    tolerance: stepTolerance,
  });

  return first === undefined ? undefined : first - center;
});

// Where the picture of the written video first changes near a frame: the one observation behind F1's `next` and `focus`
// Cues and F7's scene changes. The first frame within `reach` frames either side of `center` whose pixels differ from
// the frame before it.
import { decodeGrayFrames, firstChangedFrame } from "@reebeat/encode-ffmpeg";
import type { Box } from "@reebeat/encode-ffmpeg";
import { Effect } from "effect";

/** Pixels that differ by at most this many gray levels are compression noise, not a step. */
export const stepTolerance = 8;

/**
 * A frame has a step when at least this many pixels changed by more than the tolerance. Measured: the encoder's noise
 * between two frames of a still slide is at most about 120 such pixels, the first frame of the smallest step 349.
 */
export const stepMinPixels = 200;

/**
 * A slide change (the whole frame) has at least this many pixels changed in its first frame. Measured: the smallest
 * first frame of a scene change on the committed story is 6,100 pixels (a default fade), a cut 8,867 and an Auto-Animate
 * 19,282. The encoder's flicker on the hard edge of an Element that appeared earlier (one scanline, 288 pixels, every
 * frame) is over `stepMinPixels` and would read as the start of the change: on the offline build of the committed story
 * F7 observed the change into `sc7` 4 frames early, at the first frame of the flicker.
 */
export const slideChangeMinPixels = 1000;

/**
 * The offset in frames from `center` of the first changed frame in `[center - reach, center + reach]`, or undefined.
 * With a `box` only the pixels inside it count.
 */
export const stepOffset = Effect.fn("stepOffset")(function* step(
  mp4: string,
  center: number,
  reach: number,
  box?: Box,
  minPixels: number = stepMinPixels
) {
  const clip = yield* decodeGrayFrames(
    mp4,
    Math.max(0, center - reach - 1),
    center + reach
  );

  const first = firstChangedFrame(clip, box, {
    minPixels,
    tolerance: stepTolerance,
  });

  return first === undefined ? undefined : first - center;
});

// What the decoded frames of an event show (spec 0002, F1): plain functions over a `GrayClip`. A clip starts on the
// frame BEFORE the event (the old picture, A) and ends on a frame after it has settled (the new picture, Z); the
// observations are the first frame that no longer shows A, the first frame that shows Z again, and, for a thing that
// moves or changes colour, how far along it is in every frame in between.
import { changedPixels } from "@reebeat/encode-ffmpeg";
import type { Box, GrayClip } from "@reebeat/encode-ffmpeg";
import { Array as Arr, Option } from "effect";

import { changeFloor, stepTolerance } from "./steps.ts";

/** An event as observed: the first frame that differs from the old picture and the first that equals the new one. */
export interface EventWindow {
  readonly end: number;
  readonly start: number;
}

/**
 * The share of the whole change that may be left for a frame to count as settled (at least the pixels of a step):
 * an eased animation approaches its end without ever quite arriving, and the encoder's noise reaches about 240 pixels.
 */
const settledShare = 0.01;

/** The window between two frame indexes of `clip`, as frame numbers; none when either is none. */
const windowOf = (
  clip: GrayClip,
  start: Option.Option<number>,
  end: Option.Option<number>
): EventWindow | undefined =>
  Option.getOrUndefined(
    Option.map(Option.all({ end, start }), (both) => ({
      end: clip.firstFrame + both.end,
      start: clip.firstFrame + both.start,
    }))
  );

const framesOf = (
  clip: GrayClip
): { readonly after: Uint8Array; readonly before: Uint8Array } | undefined => {
  const [before] = clip.frames;
  const after = clip.frames.at(-1);

  return before === undefined || after === undefined
    ? undefined
    : { after, before };
};

/**
 * Where the event of `clip` starts and ends inside `region` (the whole frame when absent), by the pixels that differ:
 * as frame numbers; none when the old and the new picture do not differ enough (`changeFloor`). An instant change has
 * `start` equal to `end`.
 */
const pixelWindow = (clip: GrayClip, region?: Box): EventWindow | undefined => {
  const pictures = framesOf(clip);

  if (pictures === undefined) {
    return undefined;
  }

  const minPixels = changeFloor(clip, region);

  const differ = (left: Uint8Array, right: Uint8Array): number =>
    changedPixels(left, right, clip.width, region, stepTolerance);

  const total = differ(pictures.before, pictures.after);
  const limit = Math.max(minPixels, settledShare * total);

  const start = Arr.findFirstIndex(
    clip.frames,
    (frame, index) => index > 0 && differ(frame, pictures.before) >= minPixels
  );

  const end = Option.flatMap(start, (from) =>
    Arr.findFirstIndex(
      clip.frames,
      (frame, index) => index >= from && differ(frame, pictures.after) < limit
    )
  );

  return total < minPixels ? undefined : windowOf(clip, start, end);
};

/** How a thing is followed through the frames in between: by the box of its ink, or by the blend of its pixels. */
export type Following = "blend" | "ink";

const regionOf = (clip: GrayClip, region: Box | undefined): Box =>
  region ?? { height: clip.height, width: clip.width, x: 0, y: 0 };

/** Calls `visit(index, column, row)` for every pixel of `box` in a frame `width` wide. */
const eachPixel = (
  box: Box,
  width: number,
  visit: (index: number, column: number, row: number) => void
): void => {
  for (let row = box.y; row < box.y + box.height; row += 1) {
    for (let column = box.x; column < box.x + box.width; column += 1) {
      visit(row * width + column, column, row);
    }
  }
};

/** The sum of the absolute gray differences of two frames inside `box`. */
const absoluteDifference = (
  left: Uint8Array,
  right: Uint8Array,
  width: number,
  box: Box
): number => {
  let sum = 0;

  eachPixel(box, width, (index) => {
    sum += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  });

  return sum;
};

interface Center {
  readonly x: number;
  readonly y: number;
}

/** Whether a gray level is ink: it differs from the slide background `bg` by more than the tolerance. */
const isInk = (gray: number | undefined, bg: number): boolean =>
  Math.abs((gray ?? bg) - bg) > stepTolerance;

/**
 * The centre of the bounding box of the pixels of `frame` inside `box` that are ink and not in `fixed` (ink that is the
 * same before and after the event: other Elements).
 */
const inkCenter = (
  frame: Uint8Array,
  width: number,
  box: Box,
  bg: number,
  fixed: ReadonlySet<number>
): Center | undefined => {
  let left = Number.POSITIVE_INFINITY;
  let right = -1;
  let top = Number.POSITIVE_INFINITY;
  let bottom = -1;

  eachPixel(box, width, (index, column, row) => {
    if (isInk(frame[index], bg) && !fixed.has(index)) {
      left = Math.min(left, column);
      right = Math.max(right, column);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
  });

  return right < 0
    ? undefined
    : { x: (left + right) / 2, y: (top + bottom) / 2 };
};

/** The pixels of `box` that hold ink both before and after the event, and are the same in both. */
const fixedInk = (
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  box: Box,
  bg: number
): ReadonlySet<number> => {
  const fixed = new Set<number>();

  eachPixel(box, width, (index) => {
    const old = before[index] ?? bg;
    const now = after[index] ?? bg;

    if (
      isInk(old, bg) &&
      isInk(now, bg) &&
      Math.abs(old - now) <= stepTolerance
    ) {
      fixed.add(index);
    }
  });

  return fixed;
};

/** Where the ink is in every frame, with its old and new place; none when the old or the new picture has no ink. */
const inkTrack = (
  clip: GrayClip,
  box: Box,
  pictures: { readonly after: Uint8Array; readonly before: Uint8Array }
):
  | {
      readonly at: readonly (Center | undefined)[];
      readonly from: Center;
      readonly to: Center;
    }
  | undefined => {
  const bg = pictures.before[0] ?? 0;
  const fixed = fixedInk(pictures.before, pictures.after, clip.width, box, bg);

  const centerOf = (frame: Uint8Array) =>
    inkCenter(frame, clip.width, box, bg, fixed);

  const from = centerOf(pictures.before);
  const to = centerOf(pictures.after);

  return from === undefined || to === undefined
    ? undefined
    : { at: Arr.map(clip.frames, centerOf), from, to };
};

const distance = (left: Center, right: Center): number =>
  Math.hypot(left.x - right.x, left.y - right.y);

/** The ink moved this far (pixels) from its old place: less is the jitter of a sub-pixel start, not a motion. */
const movedPixels = 2;

/** The ink is within this far (pixels) of its new place: it has settled. */
const settledPixels = 0.5;

/**
 * Where a box that moves starts and ends, by the centre of its ink: the first frame it is `movedPixels` away from its
 * old place and the first frame it is within `settledPixels` of its new one. The pixel count of `pixelWindow` would
 * also see the one-pixel jump with which an Auto-Animate begins and the last pixels of an eased approach.
 */
const movementWindow = (
  clip: GrayClip,
  box: Box,
  pictures: { readonly after: Uint8Array; readonly before: Uint8Array }
): EventWindow | undefined => {
  const track = inkTrack(clip, box, pictures);

  if (track === undefined || distance(track.from, track.to) < movedPixels) {
    return undefined;
  }

  const { at, from, to } = track;

  const start = Arr.findFirstIndex(
    at,
    (center) => center !== undefined && distance(center, from) >= movedPixels
  );

  const end = Arr.findFirstIndex(
    at,
    (center, index) =>
      center !== undefined &&
      Option.exists(start, (first) => index >= first) &&
      distance(center, to) <= settledPixels
  );

  return windowOf(clip, start, end);
};

/**
 * Where the event of `clip` starts and ends, as frame numbers; none when the old and the new picture do not differ enough
 * to see an event. An instant change has `start` equal to `end`. A box that moves (`following` is `ink`) is measured by
 * where it is; anything else by the pixels that differ.
 */
export const eventWindow = (
  clip: GrayClip,
  region?: Box,
  following?: Following
): EventWindow | undefined => {
  const pictures = framesOf(clip);

  const moved =
    following === "ink" && pictures !== undefined
      ? movementWindow(clip, regionOf(clip, region), pictures)
      : undefined;

  return moved ?? pixelWindow(clip, region);
};

const inkFractions = (
  clip: GrayClip,
  box: Box,
  pictures: { readonly after: Uint8Array; readonly before: Uint8Array }
): readonly (number | undefined)[] => {
  const track = inkTrack(clip, box, pictures);

  if (track === undefined) {
    return [];
  }

  const dx = track.to.x - track.from.x;
  const dy = track.to.y - track.from.y;
  const length = dx * dx + dy * dy;

  return Arr.map(track.at, (center) =>
    center === undefined || length < 1
      ? undefined
      : ((center.x - track.from.x) * dx + (center.y - track.from.y) * dy) /
        length
  );
};

/**
 * How far each frame is on the way from the old picture to the new one, by the sums of absolute differences: a colour
 * that is blended from one to the other is `p` of the way when it is `p` of the sum from the old and `1 - p` from the
 * new one. A box that moves further than its own width saturates this, which is why a box is followed by its ink.
 */
const blendFractions = (
  clip: GrayClip,
  box: Box,
  pictures: { readonly after: Uint8Array; readonly before: Uint8Array }
): readonly (number | undefined)[] =>
  Arr.map(clip.frames, (frame) => {
    const fromOld = absoluteDifference(frame, pictures.before, clip.width, box);
    const toNew = absoluteDifference(frame, pictures.after, clip.width, box);

    return fromOld + toNew === 0 ? undefined : fromOld / (fromOld + toNew);
  });

/**
 * The frame, as a fractional frame number, at which the thing followed in `region` is `fraction` (0 to 1) of the way
 * from its old picture to its new one: the first frame at or past it, interpolated linearly from the frame before. A
 * box is followed by the centre of its ink (so the distance is the distance travelled), a colour by the blend of its
 * pixels. None when nothing can be followed (no ink, or no change).
 */
export const frameAtFraction = (
  clip: GrayClip,
  region: Box | undefined,
  following: Following,
  fraction: number
): number | undefined => {
  const pictures = framesOf(clip);

  if (pictures === undefined) {
    return undefined;
  }

  const box = regionOf(clip, region);

  const series =
    following === "ink"
      ? inkFractions(clip, box, pictures)
      : blendFractions(clip, box, pictures);

  const at = Arr.findFirstIndex(
    series,
    (value) => value !== undefined && value >= fraction
  );

  return Option.getOrUndefined(
    Option.flatMap(at, (index) => {
      const here = series[index];
      const before = series[index - 1];

      if (here === undefined) {
        return Option.none();
      }

      const position =
        before === undefined || here === before
          ? index
          : index - 1 + (fraction - before) / (here - before);

      return Option.some(clip.firstFrame + position);
    })
  );
};

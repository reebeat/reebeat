// What the capture tests read off the frames: gray pixels, and the first frame at which a region changes.
import { Array as Arr, Option } from "effect";

/** A rectangle of pixels: `left` and `top` are its first column and row. */
export interface Region {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/** Decoded frames of one size, 8 bits of gray per pixel, row by row; `firstFrame` is the number of `frames[0]`. */
export interface GrayClip {
  readonly firstFrame: number;
  readonly frames: readonly Uint8Array[];
  readonly width: number;
}

/** Counts as a change: at least `minPixels` pixels that differ by more than `tolerance` grey levels. */
export interface Change {
  readonly minPixels: number;
  readonly tolerance: number;
}

const anything: Change = { minPixels: 1, tolerance: 0 };

/** The pixels of `area` at which two frames differ by more than `tolerance`. A plain loop: it runs per pixel. */
const changedIn = (
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  area: Region,
  tolerance: number
): number => {
  let changed = 0;

  for (let row = area.top; row < area.top + area.height; row += 1) {
    for (let column = area.left; column < area.left + area.width; column += 1) {
      const index = row * width + column;

      if (Math.abs((before[index] ?? 0) - (after[index] ?? 0)) > tolerance) {
        changed += 1;
      }
    }
  }

  return changed;
};

/**
 * The number of the first frame of the clip that differs from the frame before it inside `region` (the whole frame when
 * absent), or undefined when none does. The first frame of the clip has no frame before it and is never returned.
 */
export const firstChangedFrame = (
  clip: GrayClip,
  region?: Region,
  change: Change = anything
): number | undefined => {
  const [first] = clip.frames;

  const area = region ?? {
    height: (first?.length ?? 0) / clip.width,
    left: 0,
    top: 0,
    width: clip.width,
  };

  return Option.getOrUndefined(
    Option.map(
      Arr.findFirstIndex(Arr.drop(clip.frames, 1), (after, index) => {
        const before = clip.frames[index];

        return (
          before !== undefined &&
          changedIn(before, after, clip.width, area, change.tolerance) >=
            change.minPixels
        );
      }),
      (index) => clip.firstFrame + index + 1
    )
  );
};

/** The frames `fromFrame` to `toFrame` (inclusive, frame numbers of the original clip) of a clip. */
export const sliceClip = (
  clip: GrayClip,
  fromFrame: number,
  toFrame: number
): GrayClip => ({
  ...clip,
  firstFrame: fromFrame,
  frames: Arr.take(
    Arr.drop(clip.frames, fromFrame - clip.firstFrame),
    toFrame - fromFrame + 1
  ),
});

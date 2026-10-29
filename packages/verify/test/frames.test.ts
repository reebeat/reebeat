// The observation of an event in decoded frames (F1): where a thing starts, ends and is N percent through. Synthetic
// clips whose truth is known, so each test can say what the observer must find and which mistake it would make.
import { assert, describe, it } from "@effect/vitest";
import type { GrayClip } from "@reebeat/encode-ffmpeg";
import { Array as Arr } from "effect";

import { eventWindow, frameAtFraction } from "../src/frames.ts";

const width = 200;
const height = 80;
const background = 240;

/** A frame of the background with filled rectangles of the given gray, as `[x, y, w, h, gray]`. */
const frameOf = (
  rectangles: readonly (readonly [number, number, number, number, number])[]
): Uint8Array => {
  const frame = new Uint8Array(width * height).fill(background);

  for (const [x, y, w, h, gray] of rectangles) {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) {
        frame[row * width + column] = gray;
      }
    }
  }

  return frame;
};

const clipOf = (frames: readonly Uint8Array[], firstFrame = 100): GrayClip => ({
  firstFrame,
  frames,
  height,
  width,
});

/** A 40 x 20 box whose left edge is at `position(frame)`, over a still box that stays where it is. */
const movingBox = (
  progress: (index: number) => number,
  count: number
): GrayClip =>
  clipOf(
    Arr.makeBy(count, (index) =>
      frameOf([
        [150, 50, 30, 20, 60],
        [Math.round(10 + 100 * progress(index)), 10, 40, 20, 40],
      ])
    )
  );

/** 0 before frame 3, linear to 1 at frame 13, 1 after: the box moves from x=10 to x=110 during 10 frames. */
const linear = (index: number): number =>
  Math.min(1, Math.max(0, (index - 3) / 10));

/** Eases out from frame 3: never quite arrives. */
const easedOut = (index: number): number =>
  index < 3 ? 0 : 1 - Math.exp(-(index - 3) / 2);

/** The smoothstep of the same ten frames: 0.5 at frame 8. */
const smooth = (index: number): number => {
  const t = linear(index);

  return t * t * (3 - 2 * t);
};

/** One pixel of jump at frame 2, a wait, then a move from frame 6 to 16. */
const jittery = (index: number): number => {
  if (index < 2) {
    return 0;
  }

  return index < 6 ? 0.01 : Math.min(1, 0.01 + (index - 6) / 10);
};

describe("eventWindow", () => {
  it("starts at the first frame that no longer shows the old picture and ends at the first that shows the new one", () => {
    const window = eventWindow(movingBox(linear, 20));

    // Frame index 4 is the first one 10 px from the start; index 13 is the first one on the end position.
    assert.deepStrictEqual(window, { end: 113, start: 104 });
  });

  it("finds nothing in a clip that never changes, and in one that changes by less than the noise", () => {
    assert.isUndefined(eventWindow(movingBox(() => 0, 12)));

    const faint = clipOf(
      Arr.makeBy(12, (index) =>
        frameOf([[10, 10, 40, 20, background - (index > 5 ? 4 : 0)]])
      )
    );

    assert.isUndefined(eventWindow(faint));
  });

  it("calls an instant change a window with no length", () => {
    const frames = Arr.makeBy(10, (index) =>
      frameOf([[10, 10, 40, 20, index < 5 ? 40 : 90]])
    );

    assert.deepStrictEqual(eventWindow(clipOf(frames)), {
      end: 105,
      start: 105,
    });
  });

  it("looks only inside the region it is given", () => {
    const clip = movingBox(linear, 20);

    // The still box at x=150 never changes: its region has no event, the moving box's region has.
    assert.isUndefined(
      eventWindow(clip, { height: 30, width: 40, x: 150, y: 45 })
    );
    assert.deepStrictEqual(
      eventWindow(clip, { height: 30, width: 150, x: 0, y: 0 }),
      {
        end: 113,
        start: 104,
      }
    );
  });

  it("ends an eased change where under 1% is left, not at the frame the curve reaches its end", () => {
    // The last 0.5% of the travel (half a pixel of 100) is below what can be seen.
    const window = eventWindow(movingBox(easedOut, 30));

    assert.isDefined(window);
    assert.isBelow(window?.end ?? 0, 115);
  });
});

describe("eventWindow of a box that moves", () => {
  it("starts when the box is 2 pixels from its old place, not at the one-pixel jump an Auto-Animate begins with", () => {
    // The box jumps one pixel at index 2 (a sub-pixel offset), then waits, then moves from index 6 to 16.
    const clip = movingBox(jittery, 24);

    assert.deepStrictEqual(eventWindow(clip, undefined, "ink"), {
      end: 116,
      start: 107,
    });
  });

  it("ends within half a pixel of the new place, where the pixel count still sees an eased tail", () => {
    const clip = movingBox(easedOut, 40);
    const moved = eventWindow(clip, undefined, "ink");

    assert.isDefined(moved);
    assert.isAbove(moved?.end ?? 0, eventWindow(clip)?.end ?? 0);
  });
});

describe("frameAtFraction", () => {
  it("follows a box by the centre of its ink: half way is half the distance, whatever the speed", () => {
    const clip = movingBox(smooth, 20);
    const half = frameAtFraction(clip, undefined, "ink", 0.5);

    // smoothstep is 0.5 at t = 0.5, which is index 8, frame 108.
    assert.isDefined(half);
    assert.closeTo(half ?? 0, 108, 0.35);
  });

  it("ignores ink that is the same before and after: another Element in the region", () => {
    const clip = movingBox(linear, 20);

    // The region holds the still box as well; it must not pull the centre.
    const half = frameAtFraction(
      clip,
      { height: 80, width: 200, x: 0, y: 0 },
      "ink",
      0.5
    );

    assert.closeTo(half ?? 0, 108, 0.35);
  });

  it("follows a colour by the blend of its pixels", () => {
    const frames = Arr.makeBy(20, (index) =>
      frameOf([[10, 10, 100, 40, Math.round(40 + 120 * linear(index))]])
    );

    const half = frameAtFraction(
      clipOf(frames),
      { height: 40, width: 100, x: 10, y: 10 },
      "blend",
      0.5
    );

    assert.closeTo(half ?? 0, 108, 0.35);
  });

  it("finds nothing to follow when the picture has no ink or does not change", () => {
    assert.isUndefined(
      frameAtFraction(
        movingBox(() => 0, 8),
        undefined,
        "ink",
        0.5
      )
    );

    const still = clipOf(Arr.makeBy(8, () => frameOf([[10, 10, 40, 20, 90]])));

    assert.isUndefined(frameAtFraction(still, undefined, "blend", 0.5));
  });
});

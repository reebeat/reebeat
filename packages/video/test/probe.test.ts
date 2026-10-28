// The probes the verify slice uses to observe a written video: where pixels change, and where a known clip lies in
// a mixed track.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import {
  audioOffsetMs,
  changedPixels,
  firstChangedFrame,
  sliceClip,
} from "../src/probe.ts";
import type { Box, GrayClip } from "../src/probe.ts";

const width = 8;
const height = 4;

/** A frame of flat gray with the given pixels set to 200. */
const frame = (lit: readonly number[] = []): Uint8Array => {
  const pixels = new Uint8Array(width * height).fill(50);

  for (const index of lit) {
    pixels[index] = 200;
  }

  return pixels;
};

const grayClip = (frames: readonly Uint8Array[]): GrayClip => ({
  firstFrame: 10,
  frames,
  height,
  width,
});

/** Frames that are flat until frame `changeAt` of the clip, then show a lit pixel. */
const changingAt = (changeAt: number): GrayClip =>
  grayClip(
    Arr.makeBy(8, (index) => (index >= changeAt ? frame([2]) : frame()))
  );

const leftHalf: Box = { height, width: 4, x: 0, y: 0 };

describe("changedPixels", () => {
  it("counts the pixels that differ inside the box only", () => {
    assert.strictEqual(changedPixels(frame(), frame([0, 1, 7]), width), 3);
    assert.strictEqual(
      changedPixels(frame(), frame([0, 1, 7]), width, leftHalf),
      2
    );
  });

  it("ignores differences up to the tolerance", () => {
    const dim = frame().map((value, index) =>
      index === 0 ? value + 5 : value
    );

    assert.strictEqual(changedPixels(frame(), dim, width, undefined, 5), 0);
    assert.strictEqual(changedPixels(frame(), dim, width, undefined, 4), 1);
  });
});

describe("firstChangedFrame", () => {
  it("is the number of the first frame that differs from the one before it", () => {
    assert.strictEqual(
      firstChangedFrame(grayClip([frame(), frame(), frame([1]), frame([1])])),
      12
    );
  });

  it("looks only inside the box", () => {
    const frames = [frame(), frame([7]), frame([7, 0])];

    assert.strictEqual(firstChangedFrame(grayClip(frames)), 11);
    assert.strictEqual(firstChangedFrame(grayClip(frames), leftHalf), 12);
  });

  it("is undefined when nothing changes, and the first frame is never reported", () => {
    assert.isUndefined(firstChangedFrame(grayClip([frame([3]), frame([3])])));
    assert.isUndefined(firstChangedFrame(grayClip([frame([3])])));
  });

  it("a change two frames later is found two frames later (the control of the shifted command)", () => {
    assert.strictEqual(firstChangedFrame(changingAt(3)), 13);
    assert.strictEqual(firstChangedFrame(changingAt(5)), 15);
  });

  it("sliceClip keeps the frame numbers of the original clip", () => {
    const sliced = sliceClip(
      grayClip([frame(), frame(), frame([1]), frame([1])]),
      11,
      13
    );

    assert.strictEqual(sliced.firstFrame, 11);
    assert.strictEqual(sliced.frames.length, 3);
    assert.strictEqual(firstChangedFrame(sliced), 12);
  });
});

const sampleRate = 48_000;

/** Seeded white noise, so that no shift looks like another. */
const noise = (length: number, seed: number): Float32Array => {
  const samples = new Float32Array(length);
  let state = seed;

  for (let index = 0; index < length; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    samples[index] = (state / 2 ** 32) * 2 - 1;
  }

  return samples;
};

describe("audioOffsetMs", () => {
  /** A 2 s track holding `clip` from `startMs` and another sound elsewhere. */
  const trackWith = (clip: Float32Array, startMs: number): Float32Array => {
    const track = new Float32Array(sampleRate * 2);
    const other = noise(sampleRate / 4, 99);

    track.set(other, sampleRate * 1.5);
    track.set(clip, Math.round((startMs * sampleRate) / 1000));

    return track;
  };

  const clip = noise(sampleRate / 2, 7);
  const frameMs = 1000 / 30;

  it("is 0 for a clip exactly where it is expected", () => {
    assert.closeTo(
      audioOffsetMs(trackWith(clip, 500), clip, 500, 200),
      0,
      0.03
    );
  });

  it("is +100 ms for a clip three frames late (the control of a delayed narration track)", () => {
    assert.closeTo(
      audioOffsetMs(trackWith(clip, 500 + 3 * frameMs), clip, 500, 200),
      100,
      0.03
    );
  });

  it("is negative for a clip that is early", () => {
    assert.closeTo(
      audioOffsetMs(trackWith(clip, 500 - 2 * frameMs), clip, 500, 200),
      -2 * frameMs,
      0.03
    );
  });

  it("finds a clip that sounds under another sound", () => {
    const track = trackWith(clip, 500 + 3 * frameMs);
    const under = noise(track.length, 5).map((sample) => sample * 0.3);

    assert.closeTo(
      audioOffsetMs(
        track.map((sample, index) => sample + (under[index] ?? 0)),
        clip,
        500,
        200
      ),
      100,
      0.03
    );
  });
});

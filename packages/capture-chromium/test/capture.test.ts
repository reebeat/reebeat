// The capture under the controlled clock, on a real Chromium: a frame is a function of its number. The fixture
// deck is test/fixtures/deck/deck.html; the Plan is test/fixturePlan.ts.
import { assert, it } from "@effect/vitest";
import { Array as Arr, Effect, Stream } from "effect";

import { clockOrigin } from "../src/capture.ts";
import { captureSchedule } from "../src/captureSchedule.ts";
import { fixture } from "./fixturePlan.ts";
import { firstChangedFrame, sliceClip } from "./pixels.ts";
import type { GrayClip, Region } from "./pixels.ts";
import {
  framesOf,
  makeWorkspace,
  pngFrameHashes,
  pngGrayFrames,
  services,
} from "./support.ts";

/** Element `b` of the first Scene: cell `br`, 360 x 150 at (860, 520). */
const boxB: Region = { height: 150, left: 860, top: 520, width: 360 };

/**
 * The strip below Element `a`'s start box (cell `tl`). Auto-Animate moves the matched Element `a` toward cell `br`,
 * so it is the only thing that enters this strip; the entering Element `d` sits inside the start box and shows
 * from the command frame on, which is why the whole frame is not the right region for the motion of `a`.
 */
const boxA: Region = { height: 120, left: 60, top: 200, width: 420 };

const clipOf = (frames: readonly Uint8Array[]): GrayClip => ({
  firstFrame: 0,
  frames,
  width: 1280,
});

it.live(
  "the first changed frame follows each command by the measured lag",
  () =>
    Effect.gen(function* lag() {
      const workspace = yield* makeWorkspace;

      const frames = yield* pngGrayFrames(
        Stream.take(framesOf(workspace), 161)
      );

      const clip = clipOf(frames);

      const changed = (from: number, to: number, box?: Region) =>
        firstChangedFrame(sliceClip(clip, from, to), box);

      // `[[next]]` of sc1.l1: commanded at frame 46, its Element fades in from frame 47 (fireFrame).
      assert.strictEqual(changed(40, 60, boxB), 47);
      // Auto-Animate into sc2: commanded at its slide frame 81. The whole frame changes at once (the unmatched
      // Elements swap); the matched Element `a` starts moving two frames later (Reveal starts it in a
      // requestAnimationFrame), which the strip below its start box shows.
      assert.strictEqual(changed(70, 95), 81);
      assert.strictEqual(changed(70, 95, boxA), 83);
      // `[[focus: a]]` of sc2.l1: commanded at 118. Reveal marks `a` as an Auto-Animate target and removes its CSS
      // transitions, so in this deck the ring shows at the command frame (118), not one frame later; F1's tolerance
      // of one frame around fireFrame 119 covers both.
      assert.strictEqual(changed(110, 130), 118);
      // The cut into sc3 is measured on the real deck (lags.test.ts): the hand-written page leaves an
      // Auto-Animate slide, which Reveal fades, so its lag is not the deck package's.

      // F7 (spot check): from three frames after the call, each of the next ten frames moves the matched Element.
      const steps = Arr.makeBy(10, (index) =>
        firstChangedFrame(sliceClip(clip, 84 + index, 85 + index))
      );

      assert.isTrue(Arr.every(steps, (step) => step !== undefined));
    }).pipe(Effect.provide(services))
);

it.live(
  "a command shifted by two frames moves the first changed frame by two",
  () =>
    Effect.gen(function* shifted() {
      const workspace = yield* makeWorkspace;
      const schedule = captureSchedule(fixture);

      const moved = {
        ...schedule,
        commands: Arr.map(schedule.commands, (step) =>
          step.source === "sc1.l1.c1"
            ? { ...step, frame: step.frame + 2 }
            : step
        ),
      };

      const frames = yield* pngGrayFrames(
        Stream.take(framesOf(workspace, moved), 61)
      );

      const first = firstChangedFrame(sliceClip(clipOf(frames), 40, 60), boxB);

      assert.strictEqual(first, 47 + 2);
      assert.notStrictEqual(first, 47);
    }).pipe(Effect.provide(services))
);

it.live(
  "two captures in two fresh browser launches give identical frames",
  () =>
    Effect.gen(function* repeat() {
      const workspace = yield* makeWorkspace;
      const first = yield* pngFrameHashes(framesOf(workspace));
      const second = yield* pngFrameHashes(framesOf(workspace));

      assert.strictEqual(first.length, fixture.timeline.totalFrames);
      assert.deepStrictEqual(second, first);
    }).pipe(Effect.provide(services))
);

/** The seeded fraction in [0, 1) of a (seed, frame) pair: a hash with no state, so a seed always repeats. */
const unitOf = (seed: number, frame: number): number =>
  Math.abs(Math.sin(seed * 12.9898 + frame * 78.233) * 43_758.5453) % 1;

/**
 * A clock that runs late by a seeded amount that grows: frame f is at its nominal time plus the sum of f seeded
 * delays of 0 to 40 ms. It never runs backwards. This is the control of F6: the page's own timers, which the seek
 * layer does not set, now fire at other frames.
 */
const jitteredClock =
  (seed: number) =>
  (frame: number): number =>
    clockOrigin +
    (frame * 1000) / 30 +
    Arr.reduce(
      Arr.range(1, frame),
      0,
      (sum, step) => sum + unitOf(seed, step) * 40
    );

it.live(
  "control: a jittered clock makes two captures differ, and the same jitter makes them equal",
  () =>
    Effect.gen(function* jitter() {
      const workspace = yield* makeWorkspace;

      const hashesWith = (seed: number) =>
        pngFrameHashes(
          framesOf(workspace, undefined, { virtualTimeOf: jitteredClock(seed) })
        );

      const [a, b, again] = [
        yield* hashesWith(1),
        yield* hashesWith(2),
        yield* hashesWith(1),
      ];

      const differing = Arr.length(
        Arr.filter(Arr.zip(a, b), ([left, right]) => left !== right)
      );

      yield* Effect.log(
        `jittered clocks: ${differing} of ${a.length} frames differ`
      );
      assert.isAbove(differing, 0);
      assert.deepStrictEqual(again, a);
    }).pipe(Effect.provide(services))
);

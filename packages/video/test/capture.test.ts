// The capture under the controlled clock, on a real Chromium: a frame is a function of its number. The fixture
// deck is test/fixtures/deck/deck.html; the Plan is test/fixturePlan.ts.
import { assert, it } from "@effect/vitest";
import { Array as Arr, Effect, Stream } from "effect";

import { captureSchedule } from "../src/captureSchedule.ts";
import { firstChangedFrame, sliceClip } from "../src/probe.ts";
import type { Box, GrayClip } from "../src/probe.ts";
import { timedFixture } from "./fixturePlan.ts";
import {
  framesOf,
  makeWorkspace,
  pngFrameHashes,
  pngGrayFrames,
  services,
} from "./support.ts";

/** Element `b` of the first Scene: cell `br`, 360 x 150 at (860, 520). */
const boxB: Box = { height: 150, width: 360, x: 860, y: 520 };

/**
 * The strip below Element `a`'s start box (cell `tl`). Auto-Animate moves the matched Element `a` toward cell `br`,
 * so it is the only thing that enters this strip; the entering Element `d` sits inside the start box and shows
 * from the command frame on, which is why the whole frame is not the right region for the lag of `a`.
 */
const boxA: Box = { height: 120, width: 420, x: 60, y: 200 };

const clipOf = (frames: readonly Uint8Array[]): GrayClip => ({
  firstFrame: 0,
  frames,
  height: 720,
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

      const changed = (from: number, to: number, box?: Box) =>
        firstChangedFrame(sliceClip(clip, from, to), box);

      // `[[next]]` of sc1.l1: commanded at frame 46, its Element fades in from frame 47 (fireFrame).
      assert.strictEqual(changed(40, 60, boxB), 47);
      // Auto-Animate into sc2: commanded at 79, the matched Element `a` leaves its start box from slideFrame 81.
      assert.strictEqual(changed(70, 95, boxA), 81);
      // `[[focus: a]]` of sc2.l1: commanded at 118. Reveal marks `a` as an Auto-Animate target and removes its CSS
      // transitions, so in this deck the ring shows at the command frame (118), not one frame later; F1's tolerance
      // of one frame around fireFrame 119 covers both.
      assert.strictEqual(changed(110, 130), 118);
      // The cut into sc3: commanded at 155, shown at slideFrame 156.
      assert.strictEqual(changed(150, 160), 156);

      // F7 (spot check): the Auto-Animate shows at least 5 consecutive intermediate frames.
      const steps = Arr.makeBy(10, (index) =>
        firstChangedFrame(sliceClip(clip, 81 + index, 82 + index))
      );

      assert.isTrue(Arr.every(steps, (step) => step !== undefined));
    }).pipe(Effect.provide(services))
);

it.live(
  "a command shifted by two frames moves the first changed frame by two",
  () =>
    Effect.gen(function* shifted() {
      const workspace = yield* makeWorkspace;
      const schedule = captureSchedule(timedFixture());

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

      assert.strictEqual(first.length, timedFixture().timeline.totalFrames);
      assert.deepStrictEqual(second, first);
    }).pipe(Effect.provide(services))
);

it.live(
  "measurement: how many frames differ between two launches without the settle wait",
  () =>
    Effect.gen(function* unsettled() {
      const workspace = yield* makeWorkspace;

      const first = yield* pngFrameHashes(
        framesOf(workspace, undefined, { settleNewAnimations: false })
      );

      const second = yield* pngFrameHashes(
        framesOf(workspace, undefined, { settleNewAnimations: false })
      );

      const differing = Arr.length(
        Arr.filter(Arr.zip(first, second), ([left, right]) => left !== right)
      );

      assert.strictEqual(first.length, second.length);
      // Measurement, reported by the task: how many frames differ without the wait.
      assert.isAtLeast(differing, 0);
      yield* Effect.log(
        `no settle: ${differing} of ${first.length} frames differ between two launches`
      );
    }).pipe(Effect.provide(services))
);

// The lags of the capture, measured on the REAL deck package's page (spec 0001, F1 and F7): a small Plan built by
// the real core from test/fixtures/lags.fountain (the committed story's mechanics: a default fade, a CUT, two
// AUTO-ANIMATEs, and focus, next and sfx Cues), the real `renderDeck`/`writeDeck`, and the real capture. A frame
// "changes" when at least 200 pixels differ by more than 8 grey levels from the frame before.
import { assert, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Stream } from "effect";

import { captureFrames } from "../src/capture.ts";
import { captureSchedule } from "../src/captureSchedule.ts";
import type { CaptureSchedule } from "../src/captureSchedule.ts";
import { firstChangedFrame, sliceClip } from "../src/probe.ts";
import type { GrayClip } from "../src/probe.ts";
import { makeRealWorkspace, realServices } from "./realDeck.ts";
import { pngGrayFrames } from "./support.ts";

const visible = { minPixels: 200, tolerance: 8 } as const;

const grayFramesOf = (
  schedule: CaptureSchedule,
  deckUrl: string,
  frames: number
) =>
  pngGrayFrames(
    Stream.take(
      captureFrames(schedule, { deckUrl, settleNewAnimations: true }),
      frames
    )
  );

const clipOf = (frames: readonly Uint8Array[]): GrayClip => ({
  firstFrame: 0,
  frames,
  height: 720,
  width: 1280,
});

/** The first visibly changed frame within `radius` frames of `around`, or undefined. */
const firstChangeNear = (
  clip: GrayClip,
  around: number,
  radius: number
): number | undefined =>
  firstChangedFrame(
    sliceClip(clip, around - radius, around + radius),
    undefined,
    visible
  );

it.live(
  "the first visibly changed frame of every scene change is its slide frame and of every next or focus cue within a frame of its fire frame",
  () =>
    Effect.gen(function* measured() {
      const workspace = yield* makeRealWorkspace;
      const { plan } = workspace;

      const clip = clipOf(
        yield* grayFramesOf(
          captureSchedule(plan),
          workspace.deckUrl,
          plan.timeline.totalFrames
        )
      );

      assert.strictEqual(clip.frames.length, plan.timeline.totalFrames);

      // Scene changes after the first: a default fade (sc2), a cut (sc3), two Auto-Animates (sc4, sc5).
      for (const scene of Arr.drop(plan.timeline.scenes, 1)) {
        assert.strictEqual(
          firstChangeNear(clip, scene.slideFrame, 4),
          scene.slideFrame,
          `the change into ${scene.sceneId} first shows at its slide frame ${scene.slideFrame}`
        );
      }

      // Cues: `next` shows its Element exactly at its fire frame; `focus` within one frame (a `.box` shows a
      // sub-pixel change one frame early, a `.label` exactly on time).
      const cues = Arr.flatMap(plan.timeline.scenes, (scene) =>
        Arr.flatMap(scene.lines, (line) => line.cues)
      );

      const planCues = Arr.flatMap(plan.scenes, (scene) =>
        Arr.flatMap(scene.lines, (line) => line.cues)
      );

      const kindOf = (cueId: string) =>
        Option.getOrThrow(Arr.findFirst(planCues, (cue) => cue.id === cueId))
          .kind;

      const stepped = Arr.filter(cues, (cue) => kindOf(cue.cueId) !== "sfx");

      assert.strictEqual(stepped.length, 3);

      for (const cue of stepped) {
        const first = firstChangeNear(clip, cue.fireFrame, 3);

        assert.isDefined(first, `${cue.cueId} shows a change`);
        assert.isAtMost(
          Math.abs((first ?? 0) - cue.fireFrame),
          1,
          `${cue.cueId} within a frame of ${cue.fireFrame}`
        );

        if (kindOf(cue.cueId) === "next") {
          assert.strictEqual(first, cue.fireFrame);
        }
      }
    }).pipe(Effect.provide(realServices))
);

it.live(
  "control: the old lag of 2 frames for an Auto-Animate shows the change two frames early",
  () =>
    Effect.gen(function* early() {
      const workspace = yield* makeRealWorkspace;
      const { plan } = workspace;
      const schedule = captureSchedule(plan);

      const sc4 = Option.getOrThrow(
        Arr.findFirst(plan.timeline.scenes, (scene) => scene.sceneId === "sc4")
      );

      const shifted: CaptureSchedule = {
        ...schedule,
        commands: Arr.map(schedule.commands, (step) =>
          step.source === "sc4" ? { ...step, frame: step.frame - 2 } : step
        ),
      };

      const clip = clipOf(
        yield* grayFramesOf(shifted, workspace.deckUrl, sc4.slideFrame + 6)
      );

      const first = firstChangeNear(clip, sc4.slideFrame, 4);

      assert.strictEqual(first, sc4.slideFrame - 2);
      assert.notStrictEqual(first, sc4.slideFrame);
    }).pipe(Effect.provide(realServices))
);

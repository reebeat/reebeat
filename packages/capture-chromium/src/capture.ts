// The capture: the deck page under the controlled clock, one PNG per frame (spec 0001, Revision "M0 measured: the
// clock decides the mechanism", mechanism Hp). The page is a pure function of the frame number:
//
//   1. the virtual clock is pre-rolled past `Reveal.initialize` (`goTo` 50 to 300 ms; `goTo(0)` never
//      initialises Reveal), and frame 0 is the virtual time T0 = 500 ms;
//   2. each frame f: the virtual clock goes to T0 + f * 1000 / fps (`virtualTimeOf`), the commands scheduled for f
//      run, every animation is paused and set to its time at f (the seek layer, with its settle wait), one
//      screenshot.
//
// The commands run after the clock step, as in the measurement. The lag between a Reveal call and the first
// changed frame, measured on the real deck (spec Revision "capture lags re-measured", `captureSchedule.ts`): an
// Auto-Animate scene change and a cut 0 frames, a default fade 1, `next` and `focus` 1, and `sfx` changes no pixel.
import type { AdapterUnavailable } from "@reebeat/services";
import { Duration, Effect, Stream } from "effect";

import { Browser } from "./browser.ts";
import type { DeckPage } from "./browser.ts";
import type { CaptureCommand, CaptureSchedule } from "./captureSchedule.ts";
import { CaptureTimeout } from "./errors.ts";
import type { BrowserFailed } from "./errors.ts";

/** The virtual time of frame 0, in milliseconds. */
export const clockOrigin = 500;

/** The virtual times of the pre-roll, in milliseconds. */
const preRoll = [50, 100, 200, 300] as const;

export interface CaptureOptions {
  /** The `file://` URL of `deck.html`. */
  readonly deckUrl: string;
  /**
   * Wait two real frames before the first seek of a new animation. The build sets it. `false` is a recorded manual
   * measurement, not an automated control: without the wait two launches of the same capture sometimes differ
   * (2 of 219 frames in one run, 0 of 219 in another, all 219 compared as raw PNG in 3 of 3 runs of a reviewer), so
   * no test can assert either outcome.
   */
  readonly settleNewAnimations: boolean;
  /** The capture's deadline in seconds; `undefined` is 120 s plus 0.2 s per frame. */
  readonly timeoutSeconds?: number | undefined;
  /**
   * The virtual time (ms) the clock is moved to for a frame; `undefined` is `clockOrigin + frame * 1000 / fps`. A
   * seam for the control of F6: a clock that jitters must make two captures differ. The times must not decrease.
   * The animations are set to the virtual time that has passed since they started, so a late clock shows in the
   * pixels; the page's own timers are on that clock too.
   */
  readonly virtualTimeOf?: ((frame: number) => number) | undefined;
}

/** The default virtual time of a frame. */
const nominalVirtualTime =
  (fps: number) =>
  (frame: number): number =>
    clockOrigin + (frame * 1000) / fps;

/** The deadline of a capture of `frames` frames when the caller gives none. */
export const defaultTimeoutSeconds = (frames: number): number =>
  120 + 0.2 * frames;

const commandsByFrame = (
  schedule: CaptureSchedule
): ReadonlyMap<number, readonly CaptureCommand[]> => {
  const byFrame = new Map<number, CaptureCommand[]>();

  for (const step of schedule.commands) {
    byFrame.set(step.frame, [...(byFrame.get(step.frame) ?? []), step.command]);
  }

  return byFrame;
};

const captureFrame = (
  page: DeckPage,
  schedule: CaptureSchedule,
  commands: ReadonlyMap<number, readonly CaptureCommand[]>,
  options: CaptureOptions
) => {
  const nominal = nominalVirtualTime(schedule.fps);
  const virtualTimeOf = options.virtualTimeOf ?? nominal;

  return Effect.fnUntraced(function* frameAt(frame: number) {
    const virtualMs = virtualTimeOf(frame);

    yield* page.clockGoTo(virtualMs);

    for (const command of commands.get(frame) ?? []) {
      yield* page.command(command);
    }

    yield* page.seek(
      frame,
      schedule.fps,
      options.settleNewAnimations,
      virtualMs - nominal(frame)
    );

    return yield* page.screenshot;
  });
};

/**
 * The PNG frames `0 .. totalFrames - 1` of the deck, one at a time and in order. The browser lives as long as the
 * stream runs. A machine without Chromium fails with `AdapterUnavailable`; a capture that outlasts its deadline fails
 * with `CaptureTimeout`.
 */
export const captureFrames = (
  schedule: CaptureSchedule,
  options: CaptureOptions
): Stream.Stream<
  Uint8Array,
  AdapterUnavailable | BrowserFailed | CaptureTimeout,
  Browser
> => {
  const seconds =
    options.timeoutSeconds ?? defaultTimeoutSeconds(schedule.totalFrames);

  const commands = commandsByFrame(schedule);

  const frames = Effect.gen(function* open() {
    const browser = yield* Browser;

    const page = yield* browser.open({
      height: schedule.height,
      url: options.deckUrl,
      width: schedule.width,
    });

    for (const virtualMs of preRoll) {
      yield* page.clockGoTo(virtualMs);
    }

    yield* page.ready;

    return Stream.range(0, schedule.totalFrames - 1).pipe(
      Stream.mapEffect(captureFrame(page, schedule, commands, options))
    );
  });

  return Stream.unwrap(frames).pipe(
    Stream.interruptWhen(
      Effect.sleep(Duration.seconds(seconds)).pipe(
        Effect.andThen(
          Effect.fail(
            new CaptureTimeout({
              frames: schedule.totalFrames,
              message: `capturing ${schedule.totalFrames} frames took longer than ${seconds} s`,
              seconds,
            })
          )
        )
      )
    )
  );
};

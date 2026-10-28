// The capture: the deck page under the controlled clock, one PNG per frame (spec 0001, Revision "M0 measured: the
// clock decides the mechanism", mechanism Hp). The page is a pure function of the frame number:
//
//   1. the virtual clock is pre-rolled past `Reveal.initialize` (`goTo` 50 to 300 ms; `goTo(0)` never
//      initialises Reveal), and frame 0 is the virtual time T0 = 500 ms;
//   2. each frame f: the virtual clock goes to T0 + f * 1000 / fps, the commands scheduled for f run, every
//      animation is paused and set to its time at f (the seek layer, with its settle wait), one screenshot.
//
// The commands run after the clock step, as in the measurement: the lag between a Reveal call and its first
// changed frame (2 frames for Auto-Animate, 1 for a fragment or a fade) was measured in that order.
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

const viewport = { height: 720, width: 1280 } as const;

export interface CaptureOptions {
  /** The `file://` URL of `deck.html`. */
  readonly deckUrl: string;
  /** Wait two real frames before the first seek of a new animation (F6 needs it; false exists for its control). */
  readonly settleNewAnimations: boolean;
  /** The capture's deadline in seconds; `undefined` is 120 s plus 0.2 s per frame. */
  readonly timeoutSeconds?: number | undefined;
}

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
  settle: boolean
) =>
  Effect.fnUntraced(function* frameAt(frame: number) {
    yield* page.clockGoTo(clockOrigin + (frame * 1000) / schedule.fps);

    for (const command of commands.get(frame) ?? []) {
      yield* page.command(command);
    }

    yield* page.seek(frame, schedule.fps, settle);

    return yield* page.screenshot;
  });

/**
 * The PNG frames `0 .. totalFrames - 1` of the deck, one at a time and in order. The browser lives as long as the
 * stream runs. A capture that outlasts its deadline fails with `CaptureTimeout`.
 */
export const captureFrames = (
  schedule: CaptureSchedule,
  options: CaptureOptions
): Stream.Stream<Uint8Array, BrowserFailed | CaptureTimeout, Browser> => {
  const seconds =
    options.timeoutSeconds ?? defaultTimeoutSeconds(schedule.totalFrames);

  const commands = commandsByFrame(schedule);

  const frames = Effect.gen(function* open() {
    const browser = yield* Browser;
    const page = yield* browser.open({ ...viewport, url: options.deckUrl });

    for (const virtualMs of preRoll) {
      yield* page.clockGoTo(virtualMs);
    }

    yield* page.ready;

    return Stream.range(0, schedule.totalFrames - 1).pipe(
      Stream.mapEffect(
        captureFrame(page, schedule, commands, options.settleNewAnimations)
      )
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

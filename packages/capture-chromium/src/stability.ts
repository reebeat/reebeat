// What makes one screenshot trustworthy (spec 0001, F6, "determinism under load"). The cause of the flake measured on
// the real story is in the README: a transition that starts in a command frame can be drawn once with a compositor
// animation clock that is not the one the page was set to. `--disable-threaded-animation` (browser.ts) removes that;
// the two functions here are the net below it:
//   stableFrame      a frame in which an animation is live or a command ran is shot until two consecutive PNGs are
//                    byte-identical, at most `maxShots` shots; a frame that never settles fails with `FrameUnstable`
//   retryScreenshot  `Page.captureScreenshot` fails now and then under load with "Unable to capture screenshot";
//                    a screenshot reads the page and changes nothing, so it is retried, at most `screenshotRetries`
//                    times, with a warning each time
// Both are plain Effects over a `take` that the caller gives (the page's screenshot): nothing here knows Playwright.
import { Duration, Effect, Schedule } from "effect";

import { FrameUnstable } from "./errors.ts";
import type { BrowserFailed } from "./errors.ts";

/** The most screenshots of one frame: the first, the second, and up to three re-captures. */
export const maxShots = 5;

/** How often a failed `Page.captureScreenshot` is called again. */
export const screenshotRetries = 2;

/** The wait before a screenshot is called again, in milliseconds. */
const retryDelayMillis = 250;

/** The message Chromium gives when it could not produce a frame; the only failure that is retried. */
const transientMessage = "Unable to capture screenshot";

export interface StableFrame {
  readonly png: Uint8Array;
  /** How many screenshots it took: 2 when the second agreed with the first. */
  readonly shots: number;
}

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

/** Shoots until two consecutive PNGs are identical; the frame number only names the failure. */
export const stableFrame = <E, R>(
  frame: number,
  take: Effect.Effect<Uint8Array, E, R>
): Effect.Effect<StableFrame, E | FrameUnstable, R> => {
  const settle = (
    previous: Uint8Array,
    shots: number
  ): Effect.Effect<StableFrame, E | FrameUnstable, R> =>
    Effect.flatMap(take, (next) => {
      if (sameBytes(previous, next)) {
        return Effect.succeed({ png: next, shots });
      }

      return shots >= maxShots
        ? Effect.fail(
            new FrameUnstable({
              frame,
              message: `frame ${frame} changed between ${maxShots} consecutive screenshots of the same page state`,
              shots,
            })
          )
        : settle(next, shots + 1);
    });

  return Effect.flatMap(take, (first) => settle(first, 2));
};

/** `take`, called again (twice at most, after a short wait, with a warning) when Chromium could not capture. */
export const retryScreenshot = <R>(
  take: Effect.Effect<Uint8Array, BrowserFailed, R>
): Effect.Effect<Uint8Array, BrowserFailed, R> =>
  take.pipe(
    Effect.tapError((failure) =>
      failure.message.includes(transientMessage)
        ? Effect.logWarning(
            `screenshot failed (at most ${screenshotRetries} retries): ${failure.message}`
          )
        : Effect.void
    ),
    Effect.retry({
      schedule: Schedule.spaced(Duration.millis(retryDelayMillis)),
      times: screenshotRetries,
      while: (failure) => failure.message.includes(transientMessage),
    })
  );

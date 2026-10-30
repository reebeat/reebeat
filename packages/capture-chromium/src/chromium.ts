// The FrameCapturer adapter of release 1: headless Chromium on a controlled clock. ABI: the Chromium binary named
// by `TSUKURI_CHROMIUM`, driven by Playwright (`browser.ts`), with `timeweb` as the virtual clock. The capture only
// emits the PNG frames; whoever consumes the stream (the Encoder) owns the pipe. Nothing is sent anywhere.
// Retirement trigger: an Effect-native browser driver, or a motion engine that renders frames without a browser.
import { SettingsSchema, requireTimeline } from "@tsukuri/core";
import type { PlanJson } from "@tsukuri/core";
import {
  AdapterUnavailable,
  CaptureError,
  FrameCapturer,
  localEgress,
} from "@tsukuri/services";
import type { CaptureFailure } from "@tsukuri/services";
import type { FileSystem } from "effect";
import {
  Array as Arr,
  Effect,
  Exit,
  Layer,
  Path,
  Predicate,
  Record,
  Stream,
} from "effect";
import type { ChildProcessSpawner } from "effect/process";

import { Browser, chromiumFlags } from "./browser.ts";
import { captureFrames, clockOrigin } from "./capture.ts";
import {
  captureSchedule,
  capturedFps,
  sceneChangeLag,
  unsupportedRate,
} from "./captureSchedule.ts";
import { maxShots, screenshotRetries } from "./stability.ts";

/** The page a Renderer writes: every Deck of release 1 has this entry. */
const deckEntry = "deck.html";

/** Whether the animations that start with a command settle for two real frames before the first seek: always. */
const settleNewAnimations = true;

/** What `info.id` says of a machine that cannot run Chromium. */
const unread = "unavailable";

export interface ChromiumOptions {
  /** The capture's deadline in seconds; `undefined` is 120 s plus 0.2 s per frame. It does not change the frames. */
  readonly timeoutSeconds?: number | undefined;
}

/**
 * Headless Chromium as a `FrameCapturer`. The layer looks for `TSUKURI_CHROMIUM`, the binary and `timeweb` when it is
 * built and settles the outcome: a machine that lacks one does not stop the layer, it fails every `capture` with
 * `AdapterUnavailable` (never a fallback). `capture` launches one browser per stream, in the stream's scope, and
 * emits PNG frame 0 to `frames(plan) - 1` in order.
 */
export const chromiumCapturerWith = (
  options: ChromiumOptions
): Layer.Layer<
  FrameCapturer,
  never,
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    FrameCapturer,
    Effect.gen(function* build() {
      const browser = yield* Browser;
      const path = yield* Path.Path;

      const id = Exit.match(yield* Effect.exit(browser.versions), {
        onFailure: () => `chromium@${unread}+timeweb@${unread}`,
        onSuccess: (versions) =>
          `chromium@${versions.chromium}+timeweb@${versions.timeweb}`,
      });

      const failed = (cause: { readonly message: string }) =>
        new CaptureError({ adapter: id, cause, message: cause.message });

      const capture = (request: {
        readonly deckDir: string;
        readonly plan: PlanJson;
      }): Stream.Stream<Uint8Array, CaptureFailure> =>
        Stream.unwrap(
          Effect.gen(function* start() {
            const plan = yield* Effect.fromResult(
              requireTimeline(request.plan)
            );

            const refusal = unsupportedRate(plan.settings);

            if (refusal !== undefined) {
              return yield* new AdapterUnavailable({
                adapter: id,
                message: refusal,
                requirement: `settings.fps ${capturedFps} with settings.ntsc false`,
                service: "FrameCapturer",
              });
            }

            const url = yield* path.toFileUrl(
              path.join(request.deckDir, deckEntry)
            );

            return captureFrames(captureSchedule(plan), {
              deckUrl: url.href,
              settleNewAnimations,
              timeoutSeconds: options.timeoutSeconds,
            });
          })
        ).pipe(
          Stream.mapError((cause): CaptureFailure =>
            Predicate.isTagged(cause, "AdapterUnavailable")
              ? cause
              : failed(cause)
          ),
          Stream.provideService(Browser, browser)
        );

      return FrameCapturer.of({
        capture,
        frames: (plan) => plan.timeline?.totalFrames ?? 0,
        info: {
          egress: localEgress,
          id,
          settings: {
            clockOrigin,
            flags: Arr.join(chromiumFlags, " "),
            fps: capturedFps,
            height: SettingsSchema.fields.height.literal,
            lags: Arr.join(
              Arr.map(
                Record.toEntries(sceneChangeLag),
                ([name, lag]) => `${name}:${lag}`
              ),
              ","
            ),
            ntsc: false,
            screenshotRetries,
            settle: settleNewAnimations,
            stability: maxShots,
            width: SettingsSchema.fields.width.literal,
          },
        },
      });
    })
  ).pipe(Layer.provide(Browser.layer));

/** Headless Chromium with the default deadline. */
export const chromiumCapturer = chromiumCapturerWith({});

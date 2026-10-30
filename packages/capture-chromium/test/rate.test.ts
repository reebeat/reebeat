// The capture renders only the frame rate its lags were measured at: any other rate, or the NTSC fraction of one, is
// refused with a typed error naming the setting, before a browser is launched (the stream fails at its start, so no
// Chromium process runs here).
import { assert, describe, it } from "@effect/vitest";
import { AdapterUnavailable, FrameCapturer } from "@tsukuri/services";
import { Effect, Layer, Stream } from "effect";

import { chromiumCapturer } from "../src/index.ts";
import { fixture } from "./fixturePlan.ts";
import { nodeServices } from "./support.ts";

const adapter = chromiumCapturer.pipe(Layer.provideMerge(nodeServices));

const refusal = (settings: { readonly fps: 24 | 30; readonly ntsc: boolean }) =>
  Effect.gen(function* refused() {
    const capturer = yield* FrameCapturer;

    return yield* Effect.flip(
      Stream.runCollect(
        capturer.capture({
          deckDir: "/nonexistent",
          plan: { ...fixture, settings: { ...fixture.settings, ...settings } },
        })
      )
    );
  }).pipe(Effect.scoped, Effect.provide(adapter));

describe("chromiumCapturer, frame rates", () => {
  it.effect(
    "refuses a nominal rate its lags were not measured at, naming settings.fps",
    () =>
      Effect.gen(function* fps() {
        const error = yield* refusal({ fps: 24, ntsc: false });

        assert.instanceOf(error, AdapterUnavailable);
        assert.strictEqual(error.service, "FrameCapturer");
        assert.include(error.requirement, "settings.fps 30");
        assert.include(error.message, "settings.fps 24");
      })
  );

  it.effect(
    "refuses the NTSC fraction of the measured rate, naming settings.ntsc",
    () =>
      Effect.gen(function* ntsc() {
        const error = yield* refusal({ fps: 30, ntsc: true });

        assert.instanceOf(error, AdapterUnavailable);
        assert.include(error.requirement, "settings.ntsc false");
        assert.include(error.message, "settings.ntsc true");
      })
  );
});

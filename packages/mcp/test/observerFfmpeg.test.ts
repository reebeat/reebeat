// The ffmpeg `Observer` on a real video (spec 0016, G8): the contract the stand-in keeps, then what only ffmpeg can
// answer: the asked frame is the frame returned, a frame fits its budget, and the audio of a tone reads as a tone.
import { assert, describe, it } from "@effect/vitest";
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import { Observer } from "@tsukuri/lifecycle";
import type { BuildFiles } from "@tsukuri/lifecycle";
import { observerClauses, registerClauses } from "@tsukuri/lifecycle/contract";
import { Array as Arr, Effect, Layer, Option, Path } from "effect";

import { audioStats, ffmpegObserver, jpegSize } from "../src/observerFfmpeg.ts";
import { FixtureService, fixtureLayer, platform } from "./support.ts";

const filesOf = Effect.gen(function* files() {
  const { harbourBuildDir } = yield* FixtureService;
  const path = yield* Path.Path;

  return {
    deck: path.join(harbourBuildDir, "deck.html"),
    dir: harbourBuildDir,
    mp4: path.join(harbourBuildDir, "harbour.mp4"),
    plan: path.join(harbourBuildDir, "plan.json"),
    vtt: path.join(harbourBuildDir, "harbour.vtt"),
  } satisfies BuildFiles;
}).pipe(Effect.provide(platform));

const provided = ffmpegObserver.pipe(
  Layer.provide(MediaTools.layer),
  Layer.provide(platform),
  Layer.provideMerge(fixtureLayer)
);

registerClauses("ffmpegObserver", provided, observerClauses(filesOf));

describe("the frames of the Observer", () => {
  it.layer(provided)("on the fixture video", (suite) => {
    suite.effect(
      "returns a different image for a different frame and the same image twice",
      () =>
        Effect.gen(function* frames() {
          const observer = yield* Observer;
          const files = yield* filesOf;

          const ask = (frame: number) =>
            observer.frame(files, {
              frame,
              frameSeconds: 1 / 30,
              maxBytes: 65_536,
              seconds: frame / 30,
            });

          const first = yield* ask(20);
          const again = yield* ask(20);
          const other = yield* ask(21);

          assert.deepStrictEqual(first.bytes, again.bytes);
          assert.notDeepEqual(first.bytes, other.bytes);
        })
    );

    suite.effect(
      "fits a small budget by scaling down, and says so when nothing fits",
      () =>
        Effect.gen(function* budgets() {
          const observer = yield* Observer;
          const files = yield* filesOf;

          const small = yield* observer.frame(files, {
            frame: 10,
            frameSeconds: 1 / 30,
            maxBytes: 4000,
            seconds: 10 / 30,
          });

          assert.isAtMost(small.bytes.byteLength, 4000);

          const past = yield* Effect.flip(
            observer.frame(files, {
              frame: 100_000,
              frameSeconds: 1 / 30,
              maxBytes: 65_536,
              seconds: 100_000 / 30,
            })
          );

          assert.strictEqual(past._tag, "ObserveFailed");
        })
    );

    suite.effect(
      "reads the tone in the audio and no onset inside a steady tone",
      () =>
        Effect.gen(function* tone() {
          const observer = yield* Observer;

          const stats = yield* observer.audio(yield* filesOf, {
            fromMs: 500,
            toMs: 1500,
          });

          assert.strictEqual(stats.buckets.length, 10);
          assert.isTrue(
            Arr.every(stats.buckets, (bucket) => bucket.rmsDb > -30)
          );
          assert.deepStrictEqual(stats.onsetsMs, []);
        })
    );
  });
});

describe("the measurements", () => {
  it("reads the size of a JPEG and nothing else", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b,
      0x08, 0x00, 0x2d, 0x00, 0x50, 0x01, 0x01, 0x11, 0x00,
    ]);

    assert.deepStrictEqual(Option.getOrUndefined(jpegSize(jpeg)), {
      height: 45,
      width: 80,
    });
    assert.isTrue(Option.isNone(jpegSize(Uint8Array.from([1, 2, 3]))));
  });

  it("finds an onset where a quiet stretch turns loud", () => {
    const quiet = new Float32Array(1600);

    const loud = Float32Array.from({ length: 1600 }, (_, index) =>
      index % 2 === 0 ? 0.5 : -0.5
    );

    const stats = audioStats(Float32Array.from([...quiet, ...loud]), 1000);

    assert.deepStrictEqual(stats.onsetsMs, [1100]);
    assert.strictEqual(stats.buckets[0]?.rmsDb, -120);
  });
});

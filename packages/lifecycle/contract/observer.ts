// The contract of `Observer` (spec 0016): what every implementation keeps, on the stand-in and on ffmpeg over a real file.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Observer } from "../src/observer.ts";
import type { BuildFiles } from "../src/read.ts";
import type { Clause } from "./clause.ts";

const jpegMagic = [0xff, 0xd8, 0xff];

export const observerClauses = <R = never>(
  source: Effect.Effect<BuildFiles, never, R>
): readonly Clause<unknown, Observer | R>[] => [
  {
    id: "O1",
    means: "frame is a JPEG no larger than maxBytes, with positive dimensions",
    run: Effect.gen(function* frame() {
      const files = yield* source;
      const observer = yield* Observer;

      const image = yield* observer.frame(files, {
        frame: 1,
        frameSeconds: 0.04,
        maxBytes: 65_536,
        seconds: 0.1,
      });

      assert.deepStrictEqual(
        Arr.fromIterable(image.bytes.slice(0, 3)),
        jpegMagic
      );
      assert.isAtMost(image.bytes.byteLength, 65_536);
      assert.isAbove(image.width, 0);
      assert.isAbove(image.height, 0);
    }),
  },
  {
    id: "O2",
    means:
      "a maxBytes no image can meet is ObserveFailed, never an oversized image",
    run: Effect.gen(function* tooSmall() {
      const files = yield* source;
      const observer = yield* Observer;

      const error = yield* Effect.flip(
        observer.frame(files, {
          frame: 1,
          frameSeconds: 0.04,
          maxBytes: 8,
          seconds: 0.1,
        })
      );

      assert.strictEqual(error._tag, "ObserveFailed");
    }),
  },
  {
    id: "O3",
    means: "media reports at least one stream",
    run: Effect.gen(function* media() {
      const files = yield* source;
      const observer = yield* Observer;
      const facts = yield* observer.media(files);

      assert.isAbove(facts.streams.length, 0);
    }),
  },
  {
    id: "O4",
    means:
      "audio buckets lie inside the window, 100 ms apart, with no more onsets than buckets",
    run: Effect.gen(function* audio() {
      const files = yield* source;
      const observer = yield* Observer;
      const stats = yield* observer.audio(files, { fromMs: 0, toMs: 500 });

      for (const bucket of stats.buckets) {
        assert.isAtLeast(bucket.fromMs, 0);
        assert.isBelow(bucket.fromMs, 500);
        assert.strictEqual(bucket.fromMs % 100, 0);
      }

      assert.isAtMost(stats.onsetsMs.length, stats.buckets.length + 1);
    }),
  },
];

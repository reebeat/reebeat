// The stand-ins pass their own contract suites, offline, and say what they are: local, sending nothing, `-standin`.
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  assetCacheContract,
  soundLibraryContract,
  speechSynthesizerContract,
  wordAlignerContract,
} from "../contract/index.ts";
import { AssetCache } from "../src/assetCache.ts";
import { SoundLibrary } from "../src/soundLibrary.ts";
import { SpeechSynthesizer } from "../src/speechSynthesizer.ts";
import { WordAligner } from "../src/wordAligner.ts";
import {
  evenAligner,
  memoryCache,
  memoryCacheWith,
  silentSynthesizer,
  toneSounds,
} from "../standins/index.ts";
import { halfWritten, platform } from "./support.ts";

speechSynthesizerContract("silentSynthesizer", silentSynthesizer);

wordAlignerContract("evenAligner", evenAligner);

soundLibraryContract("toneSounds", toneSounds);

assetCacheContract("memoryCache", Layer.provide(memoryCache, platform), {
  failingWriter: Layer.provide(
    memoryCacheWith({ beforeMetadata: Effect.fail(halfWritten) }),
    platform
  ),
});

describe("every stand-in declares itself", () => {
  it.effect("is local, sends nothing and has an id ending -standin", () =>
    Effect.gen(function* infos() {
      const declared = [
        (yield* SpeechSynthesizer).info,
        (yield* WordAligner).info,
        (yield* SoundLibrary).info,
        (yield* AssetCache).info,
      ];

      for (const info of declared) {
        assert.match(info.id, /-standin$/u);
        assert.deepStrictEqual(info.egress, { kind: "local", sends: [] });
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          silentSynthesizer,
          evenAligner,
          toneSounds,
          Layer.provide(memoryCache, platform)
        )
      )
    )
  );
});

describe("silentSynthesizer", () => {
  it.effect("speaks max(300, words * 330) ms divided by the speed", () =>
    Effect.gen(function* durations() {
      const synthesizer = yield* SpeechSynthesizer;

      const ms = (text: string, speed: number) =>
        Effect.map(
          synthesizer.synthesize({ speed, text, voice: "v" }),
          ({ clip }) =>
            Math.round((clip.samples.length / clip.sampleRate) * 1000)
        );

      assert.strictEqual(yield* ms("one", 1), 330);
      assert.strictEqual(yield* ms("one two three four", 1), 1320);
      assert.strictEqual(yield* ms("one two three four", 2), 660);
    }).pipe(Effect.provide(silentSynthesizer))
  );
});

describe("evenAligner", () => {
  it.effect(
    "spreads the words evenly when it has no hint and takes the hint when it has one",
    () =>
      Effect.gen(function* spans() {
        const aligner = yield* WordAligner;
        const clip = { sampleRate: 1000, samples: new Float32Array(1000) };
        const even = yield* aligner.align({ clip, words: ["a", "b"] });

        assert.deepStrictEqual(even.spans, [
          { endMs: 500, startMs: 0 },
          { endMs: 1000, startMs: 500 },
        ]);

        const hint = [
          { endMs: 100, startMs: 0 },
          { endMs: 900, startMs: 400 },
        ];

        assert.deepStrictEqual(
          (yield* aligner.align({ clip, hint, words: ["a", "b"] })).spans,
          hint
        );
      }).pipe(Effect.provide(evenAligner))
  );
});

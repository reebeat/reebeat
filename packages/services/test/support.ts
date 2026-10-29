// Shared by the tests: the platform services (the tests' one runtime adapter: the digest and the file system) and
// broken adapters, each built from a working one by one flaw so that exactly one contract clause fails.
import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, Layer, Ref } from "effect";

import { AssetCache } from "../src/assetCache.ts";
import { CacheFailed } from "../src/errors.ts";
import { SoundLibrary } from "../src/soundLibrary.ts";
import { SpeechSynthesizer } from "../src/speechSynthesizer.ts";
import type { AudioClip } from "../src/types.ts";
import { WordAligner } from "../src/wordAligner.ts";
import {
  evenAligner,
  memoryCache,
  silentSynthesizer,
  toneSounds,
} from "../standins/index.ts";

export const platform = Layer.merge(NodeServices.layer, NodeCrypto.layerDigest);

/** `clip` with its first sample set to `value`: a different output from the same request. */
const perturbed = (clip: AudioClip, value: number): AudioClip => {
  const samples = Float32Array.from(clip.samples);

  samples[0] = value;

  return { ...clip, samples };
};

/** A synthesiser whose output changes with every call: it breaks "equal requests give equal samples". */
export const nondeterministicSynthesizer = Layer.effect(
  SpeechSynthesizer,
  Effect.gen(function* build() {
    const base = yield* SpeechSynthesizer;
    const calls = yield* Ref.make(0);

    return SpeechSynthesizer.of({
      ...base,
      synthesize: (request) =>
        Effect.flatMap(base.synthesize(request), (synthesis) =>
          Effect.map(
            Ref.updateAndGet(calls, (n) => n + 1),
            (n) => ({
              ...synthesis,
              clip: perturbed(synthesis.clip, n / 1000),
            })
          )
        ),
    });
  })
).pipe(Layer.provide(silentSynthesizer));

/** A synthesiser that declares a credential-named setting: it breaks "info is declared and non-secret". */
export const secretSettingSynthesizer = Layer.effect(
  SpeechSynthesizer,
  Effect.map(SpeechSynthesizer, (base) =>
    SpeechSynthesizer.of({
      ...base,
      info: { ...base.info, settings: { apiKey: "x" } },
    })
  )
).pipe(Layer.provide(silentSynthesizer));

/** An aligner that answers its spans last to first: it breaks "spans are monotonic". */
export const reversingAligner = Layer.effect(
  WordAligner,
  Effect.map(WordAligner, (base) =>
    WordAligner.of({
      ...base,
      align: (request) =>
        Effect.map(base.align(request), (alignment) => ({
          ...alignment,
          spans: Arr.reverse(alignment.spans),
        })),
    })
  )
).pipe(Layer.provide(evenAligner));

/** A library whose first sound differs on every call: it breaks "a name yields the same samples". */
export const nondeterministicSounds = Layer.effect(
  SoundLibrary,
  Effect.gen(function* build() {
    const base = yield* SoundLibrary;
    const calls = yield* Ref.make(0);

    return SoundLibrary.of({
      ...base,
      sound: (name) =>
        Effect.flatMap(base.sound(name), (clip) =>
          Effect.map(
            Ref.updateAndGet(calls, (n) => n + 1),
            (n) => perturbed(clip, n / 1000)
          )
        ),
    });
  })
).pipe(Layer.provide(toneSounds));

/** A cache whose key ignores the extra JSON: it breaks "the key changes with everything that changes the output". */
export const extraBlindCache = Layer.effect(
  AssetCache,
  Effect.map(AssetCache, (base) =>
    AssetCache.of({
      ...base,
      key: ({ adapter, input }) => base.key({ adapter, input }),
    })
  )
).pipe(Layer.provide(memoryCache), Layer.provide(platform));

/** The error a half-written `put` ends with. */
export const halfWritten = new CacheFailed({
  adapter: "test",
  cause: "the writer stopped half way",
  key: "k",
  message: "the writer stopped half way",
  operation: "put",
});

/**
 * A cache whose `put` makes the asset visible and then fails: to a reader that is what a store looks like when it
 * writes its metadata before its last file and stops. It breaks "put is atomic".
 */
export const metadataFirstCache = Layer.effect(
  AssetCache,
  Effect.map(AssetCache, (base) =>
    AssetCache.of({
      ...base,
      put: (key, asset) =>
        Effect.andThen(base.put(key, asset), Effect.fail(halfWritten)),
    })
  )
).pipe(Layer.provide(memoryCache), Layer.provide(platform));

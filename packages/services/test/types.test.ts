// Type tests: the channels each service promises. Every method requires nothing, an error channel holds exactly the
// tagged errors of its contract, and the two places that do require a service (the cache key's `Digest`, the
// memory cache's Layer) say so. A requirement erased or an error widened changes a type and fails here at compile time.
import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect, Layer, Option, Stream, Scope } from "effect";
import type { Digest } from "effect/crypto";

import type { AssetCache } from "../src/assetCache.ts";
import type { assetKey } from "../src/cacheKey.ts";
import type { Encoder, MuxResult } from "../src/encoder.ts";
import type {
  AlignError,
  CacheError,
  CaptureFailure,
  EncodeError,
  KeyError,
  RenderError,
  SecretLikeSetting,
  SpeechError,
  UnknownSelection,
  UnknownSound,
} from "../src/errors.ts";
import type { FrameCapturer } from "../src/frameCapturer.ts";
import type { Renderer, RenderedDeck } from "../src/renderer.ts";
import type { decodeSelection, Selection } from "../src/selection.ts";
import type { SoundLibrary } from "../src/soundLibrary.ts";
import type { SpeechSynthesizer, Synthesis } from "../src/speechSynthesizer.ts";
import type { AudioClip, Provenance, Asset } from "../src/types.ts";
import type { Alignment, WordAligner } from "../src/wordAligner.ts";
import type {
  evenAligner,
  memoryCache,
  silentSynthesizer,
  toneSounds,
} from "../standins/index.ts";

describe("service channels", () => {
  it("every method requires nothing and fails only with its contract's errors", () => {
    expectTypeOf<
      ReturnType<SpeechSynthesizer["Service"]["synthesize"]>
    >().toEqualTypeOf<Effect.Effect<Synthesis, SpeechError>>();

    expectTypeOf<ReturnType<WordAligner["Service"]["align"]>>().toEqualTypeOf<
      Effect.Effect<Alignment, AlignError>
    >();

    expectTypeOf<ReturnType<SoundLibrary["Service"]["sound"]>>().toEqualTypeOf<
      Effect.Effect<AudioClip, UnknownSound>
    >();

    expectTypeOf<ReturnType<Renderer["Service"]["render"]>>().toEqualTypeOf<
      Effect.Effect<RenderedDeck, RenderError>
    >();

    expectTypeOf<
      ReturnType<FrameCapturer["Service"]["capture"]>
    >().toEqualTypeOf<Stream.Stream<Uint8Array, CaptureFailure, Scope.Scope>>();

    expectTypeOf<ReturnType<Encoder["Service"]["mux"]>>().toEqualTypeOf<
      Effect.Effect<MuxResult, CaptureFailure | EncodeError>
    >();

    expectTypeOf<ReturnType<AssetCache["Service"]["get"]>>().toEqualTypeOf<
      Effect.Effect<Option.Option<Asset>, CacheError>
    >();

    expectTypeOf<AssetCache["Service"]["key"]>().returns.toEqualTypeOf<
      Effect.Effect<string, KeyError>
    >();

    expectTypeOf<AssetCache["Service"]["list"]>().toEqualTypeOf<
      Effect.Effect<readonly Provenance[], CacheError>
    >();
  });

  it("the cache key requires Digest and fails only with SecretLikeSetting", () => {
    expectTypeOf<ReturnType<typeof assetKey>>().toEqualTypeOf<
      Effect.Effect<string, SecretLikeSetting, Digest.Digest>
    >();
  });

  it("the selection decodes to one literal per key and fails only with UnknownSelection", () => {
    expectTypeOf<ReturnType<typeof decodeSelection>>().toEqualTypeOf<
      Effect.Effect<Selection, UnknownSelection>
    >();
    expectTypeOf<Selection["speech"]>().toEqualTypeOf<"kokoro" | "silent">();
    expectTypeOf<Selection["aligner"]>().toEqualTypeOf<"whisper" | "even">();
  });

  it("the stand-ins need nothing, except the memory cache, which needs Digest", () => {
    expectTypeOf<typeof silentSynthesizer>().toEqualTypeOf<
      Layer.Layer<SpeechSynthesizer>
    >();
    expectTypeOf<typeof evenAligner>().toEqualTypeOf<
      Layer.Layer<WordAligner>
    >();
    expectTypeOf<typeof toneSounds>().toEqualTypeOf<
      Layer.Layer<SoundLibrary>
    >();
    expectTypeOf<typeof memoryCache>().toEqualTypeOf<
      Layer.Layer<AssetCache, never, Digest.Digest>
    >();
  });
});

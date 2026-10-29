// F13 negative controls: each service's contract suite is run against an adapter broken in one way and must fail
// the clause that names that way, and only that clause.
import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  assetCacheClauses,
  atomicWriteClause,
  encoderClauses,
  failingClauses,
  frameCapturerClauses,
  rendererClauses,
  soundLibraryClauses,
  speechSynthesizerClauses,
  wordAlignerClauses,
} from "../contract/index.ts";
import { memoryCacheWith } from "../standins/index.ts";
import { fakeCapturer, fakeEncoder, fakeProbe, fakeRenderer } from "./fakes.ts";
import {
  extraBlindCache,
  halfWritten,
  metadataFirstCache,
  nondeterministicSounds,
  nondeterministicSynthesizer,
  platform,
  reversingAligner,
  secretSettingSynthesizer,
} from "./support.ts";

describe("a broken adapter fails exactly the clause that names its flaw", () => {
  it.effect(
    "C2 of SpeechSynthesizer: a synthesiser that is not deterministic",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(
            nondeterministicSynthesizer,
            speechSynthesizerClauses()
          ),
          ["C2"]
        );
      })
  );

  it.effect("C5 of SpeechSynthesizer: a credential-named setting in info", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(
          secretSettingSynthesizer,
          speechSynthesizerClauses()
        ),
        ["C5"]
      );
    })
  );

  it.effect("C2 of WordAligner: spans that are not monotonic", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(reversingAligner, wordAlignerClauses()),
        ["C2"]
      );
    })
  );

  it.effect("C3 of SoundLibrary: a sound that changes between calls", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(nondeterministicSounds, soundLibraryClauses),
        ["C3"]
      );
    })
  );

  it.effect(
    "C3 of AssetCache: a put that makes the asset visible and then fails",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(metadataFirstCache, [atomicWriteClause]),
          ["C3"]
        );
      })
  );

  it.effect(
    "C3 of AssetCache passes on a put that stops before its metadata",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(
            Layer.provide(
              memoryCacheWith({ beforeMetadata: Effect.fail(halfWritten) }),
              platform
            ),
            [atomicWriteClause]
          ),
          []
        );
      })
  );

  it.effect("C5 of AssetCache: a key that ignores the extra JSON", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(extraBlindCache, assetCacheClauses),
        ["C5"]
      );
    })
  );

  it.effect("C4 of Renderer: a deck that leaves out the Element ids", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(
          fakeRenderer({ dropIds: true }),
          rendererClauses()
        ),
        ["C4"]
      );
    })
  );

  it.effect(
    "C6 of Renderer: a lifecycle in which a shown Element takes no time",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(
            fakeRenderer({ noShowTime: true }),
            rendererClauses()
          ),
          ["C6"]
        );
      })
  );

  it.effect(
    "C2 of FrameCapturer: one frame fewer than `frames(plan)` says",
    () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(
            Layer.mergeAll(
              fakeCapturer({ missingFrames: 1 }),
              fakeRenderer(),
              platform
            ),
            frameCapturerClauses()
          ),
          ["C2"]
        );
      })
  );

  it.effect("C3 of FrameCapturer: frames of the wrong size", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(
          Layer.mergeAll(
            fakeCapturer({ width: 640 }),
            fakeRenderer(),
            platform
          ),
          frameCapturerClauses()
        ),
        ["C3"]
      );
    })
  );

  it.effect("C4 of Encoder: a mux that drops the second track", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(
          Layer.provideMerge(fakeEncoder({ dropTrack: 1 }), platform),
          encoderClauses({ probe: fakeProbe })
        ),
        ["C4"]
      );
    })
  );

  it.effect("C5 of Encoder: a mux that drops the subtitles", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(
          Layer.provideMerge(fakeEncoder({ dropSubtitles: true }), platform),
          encoderClauses({ probe: fakeProbe })
        ),
        ["C5"]
      );
    })
  );
});

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
  contractLifecycle,
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

  for (const [name, lifecycle] of [
    ["a shown Element takes no time", { ...contractLifecycle, showMs: 0 }],
    [
      "Auto-Animate takes no time",
      {
        ...contractLifecycle,
        transitionMs: { ...contractLifecycle.transitionMs, "auto-animate": 0 },
      },
    ],
    [
      "the default fade takes no time",
      {
        ...contractLifecycle,
        transitionMs: { ...contractLifecycle.transitionMs, default: 0 },
      },
    ],
    [
      "a cut takes negative time",
      {
        ...contractLifecycle,
        transitionMs: { ...contractLifecycle.transitionMs, cut: -1 },
      },
    ],
    [
      "a matched Element starts before the slide change (a negative lag)",
      {
        ...contractLifecycle,
        matched: { ...contractLifecycle.matched, startLagFrames: -1 },
      },
    ],
    [
      "the lags were measured at 0 frames per second",
      { ...contractLifecycle, measuredFps: 0 },
    ],
    [
      "an easing whose first control point x is above 1",
      {
        ...contractLifecycle,
        matched: { ...contractLifecycle.matched, easing: [1.5, 0, 1, 1] },
      },
    ],
    [
      "an easing whose second control point x is below 0",
      {
        ...contractLifecycle,
        matched: { ...contractLifecycle.matched, easing: [0, 0, -0.1, 1] },
      },
    ],
    [
      "an unmatched Element that finishes entering before it starts",
      {
        ...contractLifecycle,
        unmatched: { enter: { endLagFrames: 5, startLagFrames: 10 } },
      },
    ],
  ] as const) {
    it.effect(`C6 of Renderer: a lifecycle in which ${name}`, () =>
      Effect.gen(function* control() {
        assert.deepStrictEqual(
          yield* failingClauses(fakeRenderer({ lifecycle }), rendererClauses()),
          ["C6"]
        );
      })
    );
  }

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

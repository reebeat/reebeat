// The contract of WordAligner: what every adapter (whisper.cpp, the even stand-in, provider timings) promises.
import { assert } from "@effect/vitest";
import { Effect } from "effect";
import type { Layer } from "effect";

import type { AlignError } from "../src/errors.ts";
import { evenSpans } from "../src/spans.ts";
import type { AudioClip, WordSpan } from "../src/types.ts";
import { WordAligner } from "../src/wordAligner.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import {
  assertInfoDeclared,
  assertSpansInside,
  durationMs,
} from "./support.ts";

export interface WordAlignerOptions {
  /** The clip to align; the default is two seconds of silence, which suits an aligner that does not listen. */
  readonly clip?: AudioClip;
  /** Whether the adapter takes a `hint` as the truth (the default) or ignores it and listens. */
  readonly usesHint?: boolean;
  /** The words of `clip`, in order. */
  readonly words?: readonly string[];
  /** When the clip is real speech: the true spans of `words`. The default is an even spread over the clip. */
  readonly truth?: readonly WordSpan[];
}

const silence = (ms: number): AudioClip => ({
  sampleRate: 16_000,
  samples: new Float32Array(Math.round((16_000 * ms) / 1000)),
});

/** The clauses of the contract, as data (the stand-ins' tests run them against broken adapters). */
export const wordAlignerClauses = (
  options: WordAlignerOptions = {}
): readonly Clause<AlignError, WordAligner>[] => {
  const clip = options.clip ?? silence(2000);
  const words = options.words ?? ["names", "are", "cheap", "today"];
  const clipMs = durationMs(clip);

  const truth = options.truth ?? evenSpans(clipMs, words.length);

  const request = { clip, words };

  return [
    {
      id: "C1",
      means: "one span per word",
      run: Effect.gen(function* clause() {
        const aligner = yield* WordAligner;
        const { spans } = yield* aligner.align(request);

        assert.strictEqual(spans.length, words.length);
      }),
    },
    {
      id: "C2",
      means: "spans are monotonic and inside the clip",
      run: Effect.gen(function* clause() {
        const aligner = yield* WordAligner;
        const { spans } = yield* aligner.align(request);

        assertSpansInside(spans, clipMs);
      }),
    },
    {
      id: "C3",
      means: "match lies in [0, 1]",
      run: Effect.gen(function* clause() {
        const aligner = yield* WordAligner;
        const { match } = yield* aligner.align(request);

        assert.isAtLeast(match, 0);
        assert.isAtMost(match, 1);
      }),
    },
    {
      id: "C4",
      means:
        "match is 1 when the hint equals the truth (adapters that ignore hints skip this)",
      run: Effect.gen(function* clause() {
        const aligner = yield* WordAligner;

        if (options.usesHint !== false) {
          const { match } = yield* aligner.align({ ...request, hint: truth });

          assert.strictEqual(match, 1);
        }
      }),
    },
    {
      id: "C5",
      means: "equal requests give equal alignments",
      run: Effect.gen(function* clause() {
        const aligner = yield* WordAligner;
        const first = yield* aligner.align(request);
        const second = yield* aligner.align(request);

        assert.deepStrictEqual(first, second);
      }),
    },
    {
      id: "C6",
      means:
        "info declares its id, its egress (local sends nothing) and non-secret settings",
      run: Effect.gen(function* clause() {
        assertInfoDeclared((yield* WordAligner).info);
      }),
    },
  ];
};

/** Registers the WordAligner contract for the adapter provided by `layer`. */
export const wordAlignerContract = <LE>(
  label: string,
  layer: Layer.Layer<WordAligner, LE>,
  options?: WordAlignerOptions
): void => {
  registerClauses(label, layer, wordAlignerClauses(options));
};

// The contract of SpeechSynthesizer: what every adapter (Kokoro, the silent stand-in, a hosted provider) promises.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";
import type { Layer } from "effect";

import type { EmptyText, SynthesisFailed } from "../src/errors.ts";
import { SpeechSynthesizer } from "../src/speechSynthesizer.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import {
  assertInfoDeclared,
  assertSpansInside,
  durationMs,
  failureOf,
  sameClip,
} from "./support.ts";

export interface SpeechSynthesizerOptions {
  /** A non-empty text of several words; the default is a short sentence. */
  readonly text?: string;
  /** The voice to ask for; the default is `default`. */
  readonly voice?: string;
}

type Failure = EmptyText | SynthesisFailed;

/** The clauses of the contract, as data (the stand-ins' tests run them against broken adapters). */
export const speechSynthesizerClauses = (
  options: SpeechSynthesizerOptions = {}
): readonly Clause<Failure, SpeechSynthesizer>[] => {
  const text = options.text ?? "Names are cheap, friend.";
  const voice = options.voice ?? "default";
  const words = Arr.filter(text.split(/\s+/u), (word) => word !== "");
  const request = { speed: 1, text, voice };

  return [
    {
      id: "C1",
      means: "non-empty text yields a clip of positive duration",
      run: Effect.gen(function* clause() {
        const synthesizer = yield* SpeechSynthesizer;
        const { clip } = yield* synthesizer.synthesize(request);

        assert.isAbove(clip.sampleRate, 0);
        assert.isAbove(durationMs(clip), 0);
      }),
    },
    {
      id: "C2",
      means: "equal requests give the same samples",
      run: Effect.gen(function* clause() {
        const synthesizer = yield* SpeechSynthesizer;
        const first = yield* synthesizer.synthesize(request);
        const second = yield* synthesizer.synthesize(request);

        assert.isTrue(sameClip(first.clip, second.clip));
      }),
    },
    {
      id: "C3",
      means: "speed 1.1 yields a clip not longer than speed 0.9",
      run: Effect.gen(function* clause() {
        const synthesizer = yield* SpeechSynthesizer;
        const slow = yield* synthesizer.synthesize({ ...request, speed: 0.9 });
        const fast = yield* synthesizer.synthesize({ ...request, speed: 1.1 });

        assert.isAtMost(
          fast.clip.samples.length / fast.clip.sampleRate,
          slow.clip.samples.length / slow.clip.sampleRate
        );
      }),
    },
    {
      id: "C4",
      means:
        "provider word timings, when present, count the whitespace words and are monotonic inside the clip",
      run: Effect.gen(function* clause() {
        const synthesizer = yield* SpeechSynthesizer;
        const { clip, words: spans } = yield* synthesizer.synthesize(request);

        if (spans !== undefined) {
          assert.strictEqual(spans.length, words.length);
          assertSpansInside(spans, durationMs(clip));
        }
      }),
    },
    {
      id: "C5",
      means:
        "info declares its id, its egress (local sends nothing) and non-secret settings",
      run: Effect.gen(function* clause() {
        assertInfoDeclared((yield* SpeechSynthesizer).info);
      }),
    },
    {
      id: "C6",
      means: "text with no words fails with the typed EmptyText",
      run: Effect.gen(function* clause() {
        const synthesizer = yield* SpeechSynthesizer;

        for (const empty of ["", "  \n\t "]) {
          const failure = yield* failureOf(
            synthesizer.synthesize({ ...request, text: empty }),
            "a synthesis of text with no words"
          );

          assert.strictEqual(failure._tag, "EmptyText");
        }
      }),
    },
  ];
};

/** Registers the SpeechSynthesizer contract for the adapter provided by `layer`. */
export const speechSynthesizerContract = <LE>(
  label: string,
  layer: Layer.Layer<SpeechSynthesizer, LE>,
  options?: SpeechSynthesizerOptions
): void => {
  registerClauses(label, layer, speechSynthesizerClauses(options));
};

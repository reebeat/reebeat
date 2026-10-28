// The silent stand-in for SpeechSynthesizer: silence as long as the words would take, with synthetic word timings.
// Offline and pure; its id ends `-standin`.
import { Array as Arr, Effect, Layer } from "effect";

import { EmptyText } from "../src/errors.ts";
import { SpeechSynthesizer } from "../src/speechSynthesizer.ts";
import { localEgress } from "../src/types.ts";
import type { WordSpan } from "../src/types.ts";

const sampleRate = 24_000;

const perWordMs = 330;

const minimumMs = 300;

/** The silent stand-in: `max(300, words * 330)` ms divided by the speed, and the words spread evenly over it. */
export const silentSynthesizer = Layer.succeed(
  SpeechSynthesizer,
  SpeechSynthesizer.of({
    info: {
      egress: localEgress,
      id: "silent@1-standin",
      settings: { perWordMs, sampleRate },
    },
    synthesize: ({ speed, text }) => {
      const words = Arr.filter(text.split(/\s+/u), (word) => word !== "");

      if (words.length === 0) {
        return Effect.fail(
          new EmptyText({ message: "there are no words to speak" })
        );
      }

      const ms = Math.round(
        Math.max(minimumMs, words.length * perWordMs) / speed
      );

      const spans: readonly WordSpan[] = Arr.map(words, (_, index) => ({
        endMs: Math.round(((index + 1) * ms) / words.length),
        startMs: Math.round((index * ms) / words.length),
      }));

      return Effect.succeed({
        clip: {
          sampleRate,
          samples: new Float32Array(Math.round((sampleRate * ms) / 1000)),
        },
        words: spans,
      });
    },
  })
);

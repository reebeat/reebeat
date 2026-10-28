// The even stand-in for WordAligner: it does not listen. It takes the hint when there is one, else it spreads the
// words evenly over the clip. Offline and pure; its id ends `-standin`.
import { Array as Arr, Effect, Layer } from "effect";

import { localEgress } from "../src/types.ts";
import type { WordSpan } from "../src/types.ts";
import { WordAligner } from "../src/wordAligner.ts";

/** The even stand-in: the hint when it has one span per word, else an even spread; match is always 1. */
export const evenAligner = Layer.succeed(
  WordAligner,
  WordAligner.of({
    align: ({ clip, hint, words }) => {
      const clipMs = (clip.samples.length / clip.sampleRate) * 1000;

      const even: readonly WordSpan[] = Arr.map(words, (_, index) => ({
        endMs: Math.round(((index + 1) * clipMs) / words.length),
        startMs: Math.round((index * clipMs) / words.length),
      }));

      return Effect.succeed({
        match: 1,
        spans: hint !== undefined && hint.length === words.length ? hint : even,
      });
    },
    info: { egress: localEgress, id: "even@1-standin", settings: {} },
  })
);

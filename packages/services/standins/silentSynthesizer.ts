// The silent stand-in for SpeechSynthesizer: silence as long as the words would take, with synthetic word timings and
// a trailing silence.
// Offline and pure; its id ends `-standin`.
import { Array as Arr, Effect, Layer } from "effect";

import { EmptyText } from "../src/errors.ts";
import { evenSpans } from "../src/spans.ts";
import { SpeechSynthesizer } from "../src/speechSynthesizer.ts";
import { localEgress } from "../src/types.ts";

const sampleRate = 24_000;

const perWordMs = 330;

const minimumMs = 300;

/**
 * Silence after the last word, as a real narrator leaves: a Cue after the last word fires at that word's end, and the
 * next change of picture comes a fixed tail after the clip ends. Without it the Cue's own animation would still run
 * when the next scene changes, and the checks that look for the first changed frame would read the wrong one.
 */
const trailingMs = 400;

/**
 * The silent stand-in: the words take `max(300, words * 330)` ms divided by the speed, spread evenly, followed by 400 ms
 * of silence.
 */
export const silentSynthesizer = Layer.succeed(
  SpeechSynthesizer,
  SpeechSynthesizer.of({
    info: {
      egress: localEgress,
      id: "silent@2-standin",
      settings: { perWordMs, sampleRate, trailingMs },
    },
    synthesize: ({ speed, text }) => {
      const words = Arr.filter(text.split(/\s+/u), (word) => word !== "");

      if (words.length === 0) {
        return Effect.fail(
          new EmptyText({ message: "there are no words to speak" })
        );
      }

      const spokenMs = Math.round(
        Math.max(minimumMs, words.length * perWordMs) / speed
      );

      return Effect.succeed({
        clip: {
          sampleRate,
          samples: new Float32Array(
            Math.round((sampleRate * (spokenMs + trailingMs)) / 1000)
          ),
        },
        words: evenSpans(spokenMs, words.length),
      });
    },
  })
);

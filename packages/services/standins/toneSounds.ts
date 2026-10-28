// The tone stand-in for SoundLibrary: one short deterministic sine tone per name of the core's catalogue.
// Offline and pure; its id ends `-standin`.
import { sfxNames } from "@reebeat/core";
import { Array as Arr, Effect, Layer, Option } from "effect";

import { UnknownSound } from "../src/errors.ts";
import { SoundLibrary } from "../src/soundLibrary.ts";
import { localEgress } from "../src/types.ts";
import type { AudioClip } from "../src/types.ts";

const sampleRate = 24_000;

const toneMs = 120;

const baseHertz = 440;

/** A sine of `hertz` for `toneMs`, faded in and out over a tenth of its length so it does not click. */
const tone = (hertz: number): AudioClip => {
  const length = Math.round((sampleRate * toneMs) / 1000);
  const fade = length / 10;

  return {
    sampleRate,
    samples: Float32Array.from({ length }, (_, index) => {
      const envelope = Math.min(1, index / fade, (length - index) / fade);

      return (
        0.5 * envelope * Math.sin((2 * Math.PI * hertz * index) / sampleRate)
      );
    }),
  };
};

const names: readonly string[] = sfxNames;

/** The tone stand-in: the catalogue's names, the n-th a perfect fifth steps above the one before. */
export const toneSounds = Layer.succeed(
  SoundLibrary,
  SoundLibrary.of({
    info: {
      egress: localEgress,
      id: "tone@1-standin",
      settings: { baseHertz, toneMs },
    },
    names,
    sound: (name) => {
      const index = Arr.findFirstIndex(
        names,
        (candidate) => candidate === name
      );

      return Option.isSome(index)
        ? Effect.succeed(tone(baseHertz * 1.5 ** index.value))
        : Effect.fail(
            new UnknownSound({
              choices: names,
              message: `no sound named "${name}"; the sounds are ${Arr.join(names, ", ")}`,
              sound: name,
            })
          );
    },
  })
);

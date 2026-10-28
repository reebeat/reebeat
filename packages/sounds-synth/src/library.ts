// The SoundLibrary adapter of release 1: the sounds are synthesised in TypeScript (`sfx.ts`), so nothing is read,
// downloaded or sent anywhere. The id carries the version of the synthesis: a change to a waveform bumps it, and
// the cache keys of everything mixed from these sounds change with it.
import type { SfxName } from "@reebeat/core";
import { SoundLibrary, UnknownSound, localEgress } from "@reebeat/services";
import { Array as Arr, Effect, Layer } from "effect";

import { sampleRate, sfxNames, synthClip } from "./sfx.ts";

/** The version of the waveforms: bump it when any sound of `sfx.ts` changes. */
const synthVersion = 1;

const isSfxName = (name: string): name is SfxName =>
  Arr.contains(sfxNames, name);

/** The built-in sounds (`pop`, `whoosh`, `ding`) as a `SoundLibrary`. */
export const synthSounds: Layer.Layer<SoundLibrary> = Layer.succeed(
  SoundLibrary,
  SoundLibrary.of({
    info: {
      egress: localEgress,
      id: `synth-sounds@${synthVersion}`,
      settings: { names: Arr.join(sfxNames, ","), sampleRate },
    },
    names: sfxNames,
    sound: Effect.fn("SoundLibrary.sound")(function* sound(name: string) {
      if (!isSfxName(name)) {
        return yield* new UnknownSound({
          choices: sfxNames,
          message: `no sound named "${name}"; the library has ${Arr.join(sfxNames, ", ")}`,
          sound: name,
        });
      }

      return synthClip(name);
    }),
  })
);

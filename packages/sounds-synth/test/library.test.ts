// The SoundLibrary contract for the synthesised sounds, the clip's relation to the WAV bytes, and a negative
// control: an adapter that is not deterministic fails clause C3 of the contract and no other.
import { assert, describe, it } from "@effect/vitest";
import { SoundLibrary } from "@tsukuri/services";
import {
  failingClauses,
  soundLibraryClauses,
  soundLibraryContract,
} from "@tsukuri/services/contract";
import { Effect, Layer } from "effect";

import {
  sampleRate,
  sfxNames,
  sfxWav,
  synthClip,
  synthSounds,
} from "../src/index.ts";

soundLibraryContract("synthSounds", synthSounds);

describe("synthClip", () => {
  it("is mono float at 48 kHz, and the WAV bytes are the same samples in 16 bits", () => {
    for (const name of sfxNames) {
      const clip = synthClip(name);
      const wav = sfxWav(name);
      const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

      assert.strictEqual(clip.sampleRate, 48_000);
      assert.strictEqual(clip.sampleRate, sampleRate);
      assert.strictEqual(clip.samples.length, (wav.byteLength - 44) / 2);

      for (const [index, sample] of clip.samples.entries()) {
        // One 16-bit step is 1 / 32767; the float clip is the unrounded value.
        assert.isAtMost(
          Math.abs(sample - view.getInt16(44 + index * 2, true) / 32_767),
          1 / 32_767,
          `${name} sample ${index}`
        );
      }
    }
  });
});

describe("synthSounds", () => {
  it.effect(
    "declares a local adapter whose id carries the synthesis version",
    () =>
      Effect.gen(function* info() {
        const library = yield* SoundLibrary;

        assert.strictEqual(library.info.id, "synth-sounds@1");
        assert.deepStrictEqual(library.info.egress, {
          kind: "local",
          sends: [],
        });
        assert.deepStrictEqual(library.names, sfxNames);
      }).pipe(Effect.provide(synthSounds))
  );
});

/** A library whose clips change on every call: the one clause it breaks is C3, determinism. */
const drifting = Layer.effect(
  SoundLibrary,
  Effect.gen(function* build() {
    const real = yield* SoundLibrary;
    let calls = 0;

    return SoundLibrary.of({
      ...real,
      sound: (name) =>
        Effect.map(real.sound(name), (clip) => {
          calls += 1;

          return {
            ...clip,
            samples: clip.samples.map((sample) => sample + calls * 1e-3),
          };
        }),
    });
  })
).pipe(Layer.provide(synthSounds));

describe("control", () => {
  it.effect("a library that is not deterministic fails C3 and only C3", () =>
    Effect.gen(function* control() {
      assert.deepStrictEqual(
        yield* failingClauses(drifting, soundLibraryClauses),
        ["C3"]
      );
      assert.deepStrictEqual(
        yield* failingClauses(synthSounds, soundLibraryClauses),
        []
      );
    })
  );
});

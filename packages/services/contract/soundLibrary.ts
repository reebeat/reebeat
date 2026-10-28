// The contract of SoundLibrary: what every sound source (synthesised tones, local files) promises.
import { assert } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";
import type { Layer } from "effect";

import type { UnknownSound } from "../src/errors.ts";
import { SoundLibrary } from "../src/soundLibrary.ts";
import { registerClauses } from "./clause.ts";
import type { Clause } from "./clause.ts";
import { assertInfoDeclared, failureOf, sameClip } from "./support.ts";

/** The clauses of the contract, as data (the stand-ins' tests run them against broken adapters). */
export const soundLibraryClauses: readonly Clause<
  UnknownSound,
  SoundLibrary
>[] = [
  {
    id: "C1",
    means:
      "every name of `names` yields a non-empty clip, and names are unique",
    run: Effect.gen(function* clause() {
      const library = yield* SoundLibrary;

      assert.isAbove(library.names.length, 0);
      assert.deepStrictEqual(Arr.dedupe(library.names), library.names);

      for (const name of library.names) {
        const clip = yield* library.sound(name);

        assert.isAbove(clip.sampleRate, 0, `${name} has a rate`);
        assert.isAbove(clip.samples.length, 0, `${name} has samples`);
      }
    }),
  },
  {
    id: "C2",
    means:
      "an unknown name fails with the typed UnknownSound, naming the sound and the choices",
    run: Effect.gen(function* clause() {
      const library = yield* SoundLibrary;

      const failure = yield* failureOf(
        library.sound("no-such-sound"),
        "a sound named no-such-sound"
      );

      assert.strictEqual(failure._tag, "UnknownSound");
      assert.strictEqual(failure.sound, "no-such-sound");
      assert.deepStrictEqual(failure.choices, library.names);
    }),
  },
  {
    id: "C3",
    means: "a name yields the same samples every time",
    run: Effect.gen(function* clause() {
      const library = yield* SoundLibrary;

      for (const name of library.names) {
        const first = yield* library.sound(name);
        const second = yield* library.sound(name);

        assert.isTrue(sameClip(first, second), `${name} is deterministic`);
      }
    }),
  },
  {
    id: "C4",
    means:
      "info declares its id, its egress (local sends nothing) and non-secret settings",
    run: Effect.gen(function* clause() {
      assertInfoDeclared((yield* SoundLibrary).info);
    }),
  },
];

/** Registers the SoundLibrary contract for the adapter provided by `layer`. */
export const soundLibraryContract = <LE>(
  label: string,
  layer: Layer.Layer<SoundLibrary, LE>
): void => {
  registerClauses(label, layer, soundLibraryClauses);
};

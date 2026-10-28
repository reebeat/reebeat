// writeRenderedDeck and writeSounds: the Renderer's files (text and bytes) land under one directory and nowhere else;
// each sound is a RIFF file of the library's clip.
import { assert, it } from "@effect/vitest";
import { SoundLibrary } from "@reebeat/services";
import type { RenderedDeck } from "@reebeat/services";
import { toneSounds } from "@reebeat/services/standins";
import { Effect, FileSystem, Layer, Predicate } from "effect";

import { writeRenderedDeck, writeSounds } from "../src/writeDeck.ts";
import { platform } from "./buildSupport.ts";

const withSounds = Layer.provideMerge(toneSounds, platform);

const directory = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  fs.makeTempDirectoryScoped({ prefix: "reebeat-write-" })
);

const deck: RenderedDeck = {
  entry: "deck.html",
  files: [
    { content: "<html></html>", path: "deck.html" },
    { content: Uint8Array.of(7, 8, 9), path: "assets/nested/font.bin" },
  ],
};

it.effect(
  "writes text and bytes under the directory, creating subdirectories",
  () =>
    Effect.gen(function* written() {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* directory;

      yield* writeRenderedDeck(dir, deck);

      assert.strictEqual(
        yield* fs.readFileString(`${dir}/deck.html`),
        "<html></html>"
      );
      assert.deepStrictEqual(
        yield* fs.readFile(`${dir}/assets/nested/font.bin`),
        Uint8Array.of(7, 8, 9)
      );
    }).pipe(Effect.scoped, Effect.provide(platform))
);

it.effect(
  "refuses a file whose path leaves the directory and writes nothing outside it",
  () =>
    Effect.gen(function* escaped() {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* directory;

      const failure = yield* Effect.flip(
        writeRenderedDeck(`${dir}/deck`, {
          entry: "deck.html",
          files: [{ content: "x", path: "../outside.txt" }],
        })
      );

      assert.isTrue(Predicate.isTagged(failure, "BuildOutputFailed"));
      assert.isFalse(yield* fs.exists(`${dir}/outside.txt`));
    }).pipe(Effect.scoped, Effect.provide(platform))
);

it.effect("writes each named sound as a WAV of the library's clip", () =>
  Effect.gen(function* sounds() {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* directory;
    const library = yield* SoundLibrary;

    yield* writeSounds(dir, ["pop", "ding"]);

    for (const name of ["pop", "ding"]) {
      const wav = yield* fs.readFile(`${dir}/assets/sfx/${name}.wav`);
      const clip = yield* library.sound(name);

      assert.strictEqual(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
      assert.strictEqual(wav.byteLength, 44 + clip.samples.length * 2);
    }
  }).pipe(Effect.scoped, Effect.provide(withSounds))
);

it.effect("an unknown sound is the library's UnknownSound", () =>
  Effect.gen(function* unknown() {
    const dir = yield* directory;
    const failure = yield* Effect.flip(writeSounds(dir, ["boing"]));

    assert.isTrue(Predicate.isTagged(failure, "UnknownSound"));
  }).pipe(Effect.scoped, Effect.provide(withSounds))
);

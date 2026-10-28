// Writing what the services produced: the Renderer's files under one directory, and each sound the Plan's Cues play
// as `assets/sfx/<name>.wav`, which the Deck's `sfx` step fetches. The file system is the platform `FileSystem`.
import { audioClipToWav } from "@reebeat/core";
import { SoundLibrary } from "@reebeat/services";
import type { RenderedDeck } from "@reebeat/services";
import { Effect, FileSystem, Path, Predicate } from "effect";

import { BuildOutputFailed, outputFailed } from "./errors.ts";

const encoder = new TextEncoder();

/** Writes every file of `deck` under `dir`, creating directories; a path that leaves `dir` is refused. */
export const writeRenderedDeck = Effect.fn("writeRenderedDeck")(
  function* writeRenderedDeck(dir: string, deck: RenderedDeck) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = `${path.resolve(dir)}${path.sep}`;

    yield* Effect.forEach(
      deck.files,
      (file) => {
        const target = path.resolve(dir, file.path);

        return target.startsWith(root)
          ? Effect.mapError(
              Effect.andThen(
                fs.makeDirectory(path.dirname(target), { recursive: true }),
                fs.writeFile(
                  target,
                  Predicate.isString(file.content)
                    ? encoder.encode(file.content)
                    : file.content
                )
              ),
              outputFailed(target, "write")
            )
          : Effect.fail(
              new BuildOutputFailed({
                cause: file.path,
                message: `the renderer's file "${file.path}" is outside the build directory`,
                path: file.path,
              })
            );
      },
      { discard: true }
    );
  }
);

/** `assets/sfx/<name>.wav` in `dir` for each of `names`, from the `SoundLibrary`. */
export const writeSounds = Effect.fn("writeSounds")(function* writeSounds(
  dir: string,
  names: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const library = yield* SoundLibrary;
  const target = path.join(dir, "assets", "sfx");

  yield* Effect.mapError(
    fs.makeDirectory(target, { recursive: true }),
    outputFailed(target, "create")
  );

  yield* Effect.forEach(
    names,
    Effect.fnUntraced(function* write(name) {
      const file = path.join(target, `${name}.wav`);

      yield* Effect.mapError(
        fs.writeFile(file, audioClipToWav(yield* library.sound(name))),
        outputFailed(file, "write")
      );
    }),
    { discard: true }
  );
});

// Reads files of the package under test: its manifest and its sources, through the Node file system.
import { NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

/** The package directory: the parent of this one. */
const packageDirectory = Effect.map(Path.Path, (path) =>
  path.resolve(import.meta.dirname, "..")
);

/** The text of a file of the package, by path relative to the package (`package.json`, `src/x.ts`). */
export const readPackageText = (relative: string) =>
  Effect.provide(
    Effect.gen(function* read() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return yield* fs.readFileString(
        path.join(yield* packageDirectory, relative)
      );
    }),
    NodeServices.layer
  );

/** The name and text of every `.ts` file under `src`. */
export const readSources = Effect.provide(
  Effect.gen(function* sources() {
    const fs = yield* FileSystem.FileSystem;
    const names = yield* fs.readDirectory(`${yield* packageDirectory}/src`);

    return yield* Effect.forEach(
      Arr.filter(names, (name) => name.endsWith(".ts")),
      (name) =>
        Effect.map(readPackageText(`src/${name}`), (text) => ({ name, text }))
    );
  }),
  NodeServices.layer
);

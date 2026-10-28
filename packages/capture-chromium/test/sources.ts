// Reads files of the package under test: its manifest and its sources, through the Node file system.
import { NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, FileSystem } from "effect";

/** The package directory: the parent of this one. */
const root = `${import.meta.dirname}/..`;

const onNode = <A, E>(
  use: (fs: FileSystem.FileSystem) => Effect.Effect<A, E>
) =>
  Effect.provide(
    Effect.flatMap(FileSystem.FileSystem, use),
    NodeServices.layer
  );

/** The text of a file of the package, by path relative to the package (`package.json`, `src/x.ts`). */
export const readPackageText = (relative: string) =>
  onNode((fs) => fs.readFileString(`${root}/${relative}`));

/** The name and text of every `.ts` file under `src`. */
export const readSources = Effect.flatMap(
  onNode((fs) => fs.readDirectory(`${root}/src`)),
  (names) =>
    Effect.forEach(
      Arr.filter(names, (name) => name.endsWith(".ts")),
      (name) =>
        Effect.map(readPackageText(`src/${name}`), (text) => ({ name, text }))
    )
);

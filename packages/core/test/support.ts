// Shared by the tests. This file is the tests' one runtime adapter: it reads files next to the tests through the
// Node file system (see the `runtime-adapter` group in vite.config.ts); the tests themselves stay platform-free.
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

/** Joins rows of a source text with newlines. */
export const asText = (rows: readonly string[]): string => Arr.join(rows, "\n");

/** Reads a file relative to this directory, as UTF-8 text. */
export const readLocal = (relative: string) =>
  Effect.provide(
    Effect.gen(function* read() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return yield* fs.readFileString(
        yield* path.fromFileUrl(new URL(relative, import.meta.url))
      );
    }),
    NodeServices.layer
  );

/** Reads a fixture of `test/fixtures`. */
export const readFixture = (name: string) => readLocal(`./fixtures/${name}`);

/** The name and text of every `.ts` file of `packages/core/src`. */
export const readSources = Effect.provide(
  Effect.gen(function* sources() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const directory = yield* path.fromFileUrl(
      new URL("../src", import.meta.url)
    );

    const names = Arr.filter(yield* fs.readDirectory(directory), (name) =>
      name.endsWith(".ts")
    );

    return yield* Effect.forEach(names, (name) =>
      Effect.map(fs.readFileString(path.join(directory, name)), (text) => ({
        name,
        text,
      }))
    );
  }),
  NodeServices.layer
);

/** The 1-based line of the only line of `source` that contains `needle`. */
export const lineOf = (source: string, needle: string): number => {
  const matches = Arr.flatMap(source.split("\n"), (line, index) =>
    line.includes(needle) ? [index + 1] : []
  );

  assert.strictEqual(matches.length, 1, `exactly one line contains ${needle}`);

  return matches[0] ?? 0;
};

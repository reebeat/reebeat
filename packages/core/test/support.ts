// Shared by the tests. This file is the tests' one runtime adapter: it reads files next to the tests through the
// Node file system (see the `runtime-adapter` group in vite.config.ts); the tests themselves stay platform-free.
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

import type { HeardWord } from "../src/align.ts";
import type { PlanJson } from "../src/plan.ts";
import type { AlignedLine } from "../src/schedule.ts";

/** The hash the tests pass as `sourceSha256`: the core copies it into the Plan and never computes one. */
export const fixtureSha256 =
  "5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e";

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

/** What whisper would hear if it heard every word of `words` exactly, 100 ms each. */
export const perfectlyHeard = (
  words: readonly string[]
): readonly HeardWord[] =>
  Arr.map(words, (w, index) => ({
    endMs: index * 100 + 100,
    startMs: index * 100,
    w,
  }));

/** The audio file name of a Line `digit`: 64 hexadecimal digits and `.flac`. */
export const audioOf = (digit: number) => ({
  file: `${String(digit).repeat(64)}.flac`,
  sha256: `hash-${digit}`,
});

/** Every Line of `plan` spoken evenly: `wordMs` per word, each word ending where the next starts. */
export const evenlySpoken = (plan: PlanJson, wordMs: number): AlignedLine[] =>
  Arr.flatMap(plan.scenes, (scene) =>
    Arr.map(scene.lines, (line, index) => ({
      audio: audioOf((index % 9) + 1),
      durationMs: line.words.length * wordMs,
      lineId: line.id,
      words: Arr.map(line.words, (w, at) => ({
        endMs: (at + 1) * wordMs,
        startMs: at * wordMs,
        w,
      })),
    }))
  );

/** The renderer lifecycle the tests schedule with. */
export { referenceLifecycle as lifecycle } from "../src/plan.ts";

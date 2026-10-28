// Shared by the tests. This file is the tests' one runtime adapter: it reads the committed story and the package's
// own files, and writes Decks to temporary directories, through the Node file system; the tests stay platform-free.
import { NodeServices } from "@effect/platform-node";
import { buildPlan } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, FileSystem, Order, Path } from "effect";

import { renderDeck, writeDeck } from "../src/index.ts";
import type { DeckBundle } from "../src/index.ts";

/** The hash the tests pass as `sourceSha256`: the core copies it into the Plan and never computes one. */
export const fixtureSha256 =
  "5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e5ca1ab1e";

/** Joins rows of a source text with newlines. */
export const asText = (rows: readonly string[]): string => Arr.join(rows, "\n");

/** Reads the text of a file below `base` (this directory when omitted) at `relative`. */
export const readIn = (base: string, relative: string) =>
  Effect.provide(
    Effect.gen(function* readText() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return yield* fs.readFileString(path.join(base, relative));
    }),
    NodeServices.layer
  );

/** The directory of the package under test. */
const packageDirectory = Effect.provide(
  Effect.gen(function* directory() {
    const path = yield* Path.Path;

    return path.resolve(import.meta.dirname, "..");
  }),
  NodeServices.layer
);

/** The text of a file of the package under test, by path relative to the package (`package.json`, `src/x.ts`). */
export const readPackageText = (relative: string) =>
  Effect.flatMap(packageDirectory, (directory) => readIn(directory, relative));

/** The Plan of a screenplay text, with the fixture hash. */
export const planOf = (source: string) => buildPlan(source, fixtureSha256);

/** The Plan of the committed story `stories/same-id/story.fountain`. */
export const storyPlan = Effect.flatMap(
  Effect.flatMap(packageDirectory, (directory) =>
    readIn(directory, "../../stories/same-id/story.fountain")
  ),
  planOf
);

/** The name and text of every `.ts` file under `src`. */
export const readSources = Effect.provide(
  Effect.gen(function* sources() {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* packageDirectory;
    const path = yield* Path.Path;

    const files = yield* fs.readDirectory(path.join(directory, "src"));

    return yield* Effect.forEach(
      Arr.filter(files, (file) => file.endsWith(".ts")),
      (name) =>
        Effect.map(readPackageText(`src/${name}`), (text) => ({ name, text }))
    );
  }),
  NodeServices.layer
);

/**
 * Writes `bundle` (by default the Deck of `plan`) into a fresh temporary directory (removed with the test's scope)
 * through `writeDeck` and returns the directory. Fails like `writeDeck` does.
 */
export const writtenDeck = (
  plan: PlanJson,
  bundle: DeckBundle = renderDeck(plan)
) =>
  Effect.provide(
    Effect.gen(function* written() {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "deck-" });

      yield* writeDeck(bundle, directory, plan);

      return directory;
    }),
    NodeServices.layer
  );

/** The files of a written Deck directory (relative paths, sorted), excluding directories. */
export const listFiles = (directory: string) =>
  Effect.provide(
    Effect.gen(function* listing() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const entries = yield* fs.readDirectory(directory, { recursive: true });

      const files = yield* Effect.filter(entries, (entry) =>
        Effect.map(
          fs.stat(path.join(directory, entry)),
          (info) => info.type === "File"
        )
      );

      return Arr.sort(files, Order.String);
    }),
    NodeServices.layer
  );

/** Whether a path of a written Deck directory exists. */
export const existsIn = (directory: string, relative: string) =>
  Effect.provide(
    Effect.gen(function* checking() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return yield* fs.exists(path.join(directory, relative));
    }),
    NodeServices.layer
  );

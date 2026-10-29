// Shared by the tests. This file is the tests' one runtime adapter: it reads the committed story and the package's
// own files, and writes Decks to temporary directories, through the Node file system; the tests stay platform-free.
import { NodeServices } from "@effect/platform-node";
import { buildPlan, schedule } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import { alignedLines } from "@reebeat/services/contract";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Order,
  Path,
  Predicate,
  String as Str,
} from "effect";

import {
  assembleDeck,
  readAssets,
  renderDeck,
  revealLifecycle,
  revealRenderer,
} from "../src/index.ts";
import type { DeckBundle } from "../src/index.ts";

/** The reveal.js Renderer on the Node file system: the tests' one adapter layer. */
export const revealLayer = revealRenderer.pipe(
  Layer.provide(NodeServices.layer)
);

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

/** Two steps and three sounds: one rides a step, one the slide, one is anchored to a word before any step. */
export const carrySource = asText([
  "# One",
  "",
  "INT. A - DAY #sc1#",
  "",
  "Alpha {id=a cell=ml class=box}",
  "Beta {id=b cell=mr class=box visible=false}",
  "",
  "[[effects",
  "  s1: sound whoosh at transition.start",
  '  s2: sound pop at word("one").end',
  '  r1: show b at word("three").end',
  '  s3: sound ding at word("five").end',
  '  f1: focus a at word("six").end',
  "]]",
  "",
  "NARRATOR",
  "One two three four five six seven eight.",
]);

/**
 * A ring that ends by its own `until` (`f1`: a start and an end step), a second focus after it (`f2`), and two sounds
 * that ride the start of `f1`.
 */
export const ringSource = asText([
  "# One",
  "",
  "INT. A - DAY #sc1#",
  "",
  "Alpha {id=a cell=ml class=box}",
  "Beta {id=b cell=mr class=box}",
  "",
  "[[effects",
  '  p1: sound ding at word("two").end',
  '  f1: focus a at word("one").end until word("three").end',
  '  f2: focus b at word("five").end',
  '  s1: sound pop at word("three").end',
  "]]",
  "",
  "NARRATOR",
  "One two three four five six seven eight.",
]);

/** The Plan of a screenplay text, scheduled against the lifecycle reveal.js declares. */
export const scheduledOf = (source: string) =>
  Effect.flatMap(planOf(source), (plan) =>
    schedule(plan, alignedLines(plan), revealLifecycle)
  );

/** The Plan of the committed story `stories/same-id/story.fountain` with a Timeline. */
export const scheduledStory = Effect.flatMap(
  Effect.flatMap(packageDirectory, (directory) =>
    readIn(directory, "../../stories/same-id/story.fountain")
  ),
  scheduledOf
);

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
      Arr.filter(files, (file) => Str.endsWith(".ts")(file)),
      (name) =>
        Effect.map(readPackageText(`src/${name}`), (text) => ({ name, text }))
    );
  }),
  NodeServices.layer
);

/**
 * Assembles `bundle` (by default the Deck of `plan`) into a `RenderedDeck`, writes its files into a fresh temporary
 * directory (removed with the test's scope) and returns the directory. Fails like `assembleDeck` does. This is the
 * tests' stand-in for the pipeline's file writing.
 */
export const writtenDeck = (
  plan: PlanJson,
  bundle: DeckBundle = renderDeck(plan)
) =>
  Effect.provide(
    Effect.gen(function* written() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "deck-" });
      const deck = yield* assembleDeck(plan, bundle, yield* readAssets());

      yield* Effect.forEach(deck.files, ({ content, path: relative }) => {
        const target = path.join(directory, relative);

        return Effect.andThen(
          fs.makeDirectory(path.dirname(target), { recursive: true }),
          Predicate.isString(content)
            ? fs.writeFileString(target, content)
            : fs.writeFile(target, content)
        );
      });

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

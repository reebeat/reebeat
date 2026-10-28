// Bundle to disk: `writeDeck` writes `deck.html` and the generated text files, copies the binary assets from the
// installed packages (reveal.js, Inter) and then reads `deck.html` back and runs `checkDeck` on it, so a Deck that
// disagrees with its Plan fails the build (spec 0001, F4: "the generator re-reads its own output").
//
// The deck makes no network request at runtime: every asset below is copied next to the page and referenced by a
// relative URL. The sound files `assets/sfx/<name>.wav` are written by the CLI, not here.
import type { PlanJson } from "@reebeat/core";
import { Array as Arr, Effect, FileSystem, Path } from "effect";

import { checkDeck } from "./check.ts";
import { DeckAssetMissing } from "./errors.ts";
import type { DeckBundle } from "./render.ts";
import { fontFaces } from "./theme.ts";

/** Files of one installed package: `entry` is a specifier the package exports; `from` is relative to its directory. */
interface AssetSource {
  readonly copies: readonly { readonly from: string; readonly to: string }[];
  readonly entry: string;
}

const assetSources: readonly AssetSource[] = [
  {
    // `reveal.js/reveal.css` is `dist/reveal.css`; the licence sits one directory up.
    copies: [
      { from: "reveal.js", to: "assets/reveal/reveal.js" },
      { from: "reveal.css", to: "assets/reveal/reveal.css" },
      { from: "reset.css", to: "assets/reveal/reset.css" },
      { from: "plugin/notes.js", to: "assets/reveal/plugin/notes.js" },
      { from: "../LICENSE", to: "assets/reveal/LICENSE" },
    ],
    entry: "reveal.js/reveal.css",
  },
  {
    // `@fontsource/inter/400.css` is at the package root, next to `files/` and `LICENSE`.
    copies: [
      ...Arr.map(fontFaces, ({ file }) => ({
        from: `files/${file}`,
        to: `assets/fonts/${file}`,
      })),
      { from: "LICENSE", to: "assets/fonts/LICENSE" },
    ],
    entry: "@fontsource/inter/400.css",
  },
];

/** The directory of an installed package file, found the way the runtime resolves its import. */
const directoryOf = Effect.fnUntraced(function* directoryOf(entry: string) {
  const path = yield* Path.Path;

  const url = yield* Effect.try({
    catch: (cause) =>
      new DeckAssetMissing({
        cause,
        message: `${entry} is not installed`,
        specifier: entry,
      }),
    try: () => import.meta.resolve(entry),
  });

  return path.dirname(yield* path.fromFileUrl(new URL(url)));
});

/**
 * Writes the Deck of `plan` into `outDir`: `deck.html`, the bundle's text files and the copied assets. Then reads
 * `deck.html` back and fails with `DeckMismatch` if it differs from `plan` (F3, F4, F5).
 */
export const writeDeck = Effect.fn("writeDeck")(function* writeDeck(
  bundle: DeckBundle,
  outDir: string,
  plan: PlanJson
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const put = Effect.fnUntraced(function* put(relative: string, text: string) {
    const target = path.join(outDir, relative);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, text);
  });

  yield* Effect.forEach(bundle.files, (file) => put(file.path, file.text));

  yield* Effect.forEach(assetSources, (source) =>
    Effect.gen(function* copyPackage() {
      const directory = yield* directoryOf(source.entry);

      yield* Effect.forEach(source.copies, (copy) => {
        const target = path.join(outDir, copy.to);

        return Effect.andThen(
          fs.makeDirectory(path.dirname(target), { recursive: true }),
          fs.copyFile(path.join(directory, copy.from), target)
        );
      });
    })
  );

  yield* put("deck.html", bundle.html);

  yield* checkDeck(
    plan,
    yield* fs.readFileString(path.join(outDir, "deck.html"))
  );
});

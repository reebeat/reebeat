// The binary assets of the Deck, read from the installed packages (reveal.js, Inter) as bytes, with the version of
// each package: the Deck makes no network request at runtime, so every file below is written next to the page and
// referenced by a relative URL. The sound files `assets/sfx/<name>.wav` come from the SoundLibrary, not from here.
import { Array as Arr, Effect, FileSystem, Path, Schema } from "effect";

import { DeckAssetMissing } from "./errors.ts";
import { fontFaces } from "./theme.ts";

/** One file of the Deck: its path relative to the Deck directory, and its bytes. */
export interface DeckAsset {
  readonly bytes: Uint8Array;
  readonly path: string;
}

/** What `readAssets` found: the files and the version of the two packages they come from. */
export interface DeckAssets {
  readonly files: readonly DeckAsset[];
  readonly interVersion: string;
  readonly revealVersion: string;
}

/** Files of one installed package: `entry` is a specifier the package exports; `from` is relative to its directory. */
interface AssetSource {
  readonly copies: readonly { readonly from: string; readonly to: string }[];
  readonly entry: string;
  /** The package's root, relative to the directory of `entry`. */
  readonly root: string;
}

const revealSource: AssetSource = {
  // `reveal.js/reveal.css` is `dist/reveal.css`; the licence and `package.json` sit one directory up.
  copies: [
    { from: "reveal.js", to: "assets/reveal/reveal.js" },
    { from: "reveal.css", to: "assets/reveal/reveal.css" },
    { from: "reset.css", to: "assets/reveal/reset.css" },
    { from: "plugin/notes.js", to: "assets/reveal/plugin/notes.js" },
    { from: "../LICENSE", to: "assets/reveal/LICENSE" },
  ],
  entry: "reveal.js/reveal.css",
  root: "..",
};

const interSource: AssetSource = {
  // `@fontsource/inter/400.css` is at the package root, next to `files/` and `LICENSE`.
  copies: [
    ...Arr.map(fontFaces, ({ file }) => ({
      from: `files/${file}`,
      to: `assets/fonts/${file}`,
    })),
    { from: "LICENSE", to: "assets/fonts/LICENSE" },
  ],
  entry: "@fontsource/inter/400.css",
  root: ".",
};

const PackageVersion = Schema.fromJsonString(
  Schema.Struct({ version: Schema.String })
);

const decodePackageVersion = Schema.decodeUnknownEffect(PackageVersion);

const missing = (specifier: string, message: string) => (cause: unknown) =>
  new DeckAssetMissing({ cause, message, specifier });

/** The directory of an installed package file, found the way the runtime resolves its import. */
const directoryOf = Effect.fnUntraced(function* directoryOf(entry: string) {
  const path = yield* Path.Path;

  const url = yield* Effect.try({
    catch: missing(entry, `${entry} is not installed`),
    try: () => import.meta.resolve(entry),
  });

  const file = yield* Effect.mapError(
    path.fromFileUrl(new URL(url)),
    missing(entry, `${entry} does not resolve to a file`)
  );

  return path.dirname(file);
});

const readSource = Effect.fnUntraced(function* readSource(source: AssetSource) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* directoryOf(source.entry);

  const files = yield* Effect.forEach(source.copies, (copy) =>
    Effect.map(
      Effect.mapError(
        fs.readFile(path.join(directory, copy.from)),
        missing(source.entry, `${copy.from} of ${source.entry} cannot be read`)
      ),
      (bytes): DeckAsset => ({ bytes, path: copy.to })
    )
  );

  const manifest = yield* Effect.mapError(
    fs.readFileString(path.join(directory, source.root, "package.json")),
    missing(source.entry, `package.json of ${source.entry} cannot be read`)
  );

  const { version } = yield* Effect.mapError(
    decodePackageVersion(manifest),
    missing(source.entry, `package.json of ${source.entry} has no version`)
  );

  return { files, version };
});

/** Reads the assets of the Deck from the installed packages. */
export const readAssets = Effect.fn("readAssets")(function* readAssets() {
  const reveal = yield* readSource(revealSource);
  const inter = yield* readSource(interSource);

  return {
    files: [...reveal.files, ...inter.files],
    interVersion: inter.version,
    revealVersion: reveal.version,
  } satisfies DeckAssets;
});

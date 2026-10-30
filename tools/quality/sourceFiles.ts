// The TypeScript sources below a directory, as the release rules read them (spec 0009). Moved unchanged from
// `tools/quality/tiers.ts` (this repository, commit 56a2155) when ox-dep-lint replaced the tier gate (spec 0017);
// `release.ts` is its only caller now.
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  String as Str,
} from "effect";
import type { PlatformError } from "effect";

/** Directories that hold no package source: dependencies, tests, live suites, fixtures, build output, git. */
const ignoredDirectories: readonly string[] = [
  "node_modules",
  "test",
  "live",
  "fixtures",
  "dist",
  ".git",
];

const sourcePattern = /\.[cm]?tsx?$/u;

/** What a package directory holds. */
export interface SourceListing {
  /** The source files (full paths): TypeScript, without dependencies, tests, fixtures and `.d.ts` files. */
  readonly files: readonly string[];
  /** Entries the walk cannot see through (a symbolic link, an entry of unknown type), as full paths. */
  readonly opaque: readonly string[];
}

const noSources: SourceListing = { files: [], opaque: [] };

const byName = Order.mapInput(
  Order.String,
  (entry: FileSystem.DirectoryEntry) => entry.name
);

/**
 * The sources below a package directory. One `readDirectoryEntries` per directory gives each entry's type without a
 * `stat`, so a symbolic link is seen as one and reported in `opaque` instead of being followed or skipped; a
 * directory that cannot be read fails the listing. (`FileSystem.glob` was measured and rejected for this: it does
 * not follow a link under `**` and skips an unreadable directory, both silently.)
 */
export const sourceFiles = Effect.fnUntraced(function* listSources(
  directory: string
): Effect.fn.Return<
  SourceListing,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fs.readDirectoryEntries(directory);

  const listings = yield* Effect.forEach(
    Arr.sort(entries, byName),
    ({
      name,
      type,
    }): Effect.Effect<
      SourceListing,
      PlatformError.PlatformError,
      FileSystem.FileSystem | Path.Path
    > => {
      const full = path.join(directory, name);

      if (type === "File") {
        return Effect.succeed(
          sourcePattern.test(name) && !Str.endsWith(".d.ts")(name)
            ? { files: [full], opaque: [] }
            : noSources
        );
      }

      if (Arr.contains(ignoredDirectories, name)) {
        return Effect.succeed(noSources);
      }

      return type === "Directory"
        ? sourceFiles(full)
        : Effect.succeed({ files: [], opaque: [full] });
    }
  );

  return {
    files: Arr.flatMap(listings, (listing) => listing.files),
    opaque: Arr.flatMap(listings, (listing) => listing.opaque),
  };
});

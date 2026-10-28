import { sha256Hex } from "@reebeat/speech";
// `build.json`, written last: its presence says the build finished. It lists every other file of the build with
// its SHA-256 and size, and the hash of the source. The declared field order is alphabetical so equal builds write
// equal text. `@reebeat/verify` reads the same file; the field names are the contract between the two.
import { Array as Arr, Effect, FileSystem, Order, Path, Schema } from "effect";

import { NotABuild, outputFailed } from "./errors.ts";

export const manifestFile = "build.json";

const FileEntrySchema = Schema.Struct({
  bytes: Schema.Int,
  path: Schema.NonEmptyString,
  sha256: Schema.String,
});

const BuildManifestSchema = Schema.Struct({
  files: Schema.Array(FileEntrySchema),
  schema: Schema.Literal(1),
  /** The base name of the `.fountain` file. */
  sourcePath: Schema.NonEmptyString,
  sourceSha256: Schema.String,
});

type BuildManifest = typeof BuildManifestSchema.Type;

const manifestJson = Schema.fromJsonString(BuildManifestSchema, { space: 2 });
const encodeManifest = Schema.encodeEffect(manifestJson);
const decodeManifest = Schema.decodeUnknownEffect(manifestJson);

/** Every file under `dir` (not directories), as a POSIX path relative to `dir`, sorted. */
const listFiles = Effect.fnUntraced(function* listFiles(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const entries = yield* Effect.mapError(
    fs.readDirectory(dir, { recursive: true }),
    outputFailed(dir, "list")
  );

  const files = yield* Effect.filter(entries, (entry) =>
    Effect.map(
      Effect.mapError(
        fs.stat(path.join(dir, entry)),
        outputFailed(entry, "stat")
      ),
      (info) => info.type === "File"
    )
  );

  return Arr.sort(
    Arr.map(files, (file) => Arr.join(file.split(path.sep), "/")),
    Order.String
  );
});

/**
 * Writes `build.json` into `dir` for the files it holds now. Call it after every other file is written; the
 * manifest does not list itself.
 */
export const writeManifest = Effect.fn("writeManifest")(function* writeManifest(
  dir: string,
  source: { readonly path: string; readonly sha256: string }
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const files = yield* Effect.forEach(yield* listFiles(dir), (file) =>
    Effect.gen(function* entry() {
      const location = path.join(dir, file);

      const bytes = yield* Effect.mapError(
        fs.readFile(location),
        outputFailed(location, "read")
      );

      const sha256 = yield* Effect.mapError(
        sha256Hex(bytes),
        outputFailed(location, "hash")
      );

      return { bytes: bytes.byteLength, path: file, sha256 };
    })
  );

  const manifest: BuildManifest = {
    files,
    schema: 1,
    sourcePath: path.basename(source.path),
    sourceSha256: source.sha256,
  };

  const target = path.join(dir, manifestFile);

  yield* Effect.mapError(
    Effect.flatMap(encodeManifest(manifest), (text) =>
      fs.writeFileString(target, text)
    ),
    outputFailed(target, "write")
  );

  return manifest;
});

const refusal = (dir: string, message: string) =>
  new NotABuild({ dir, message });

/**
 * The manifest of a finished build, or why `dir` is not one: `build.json` is missing (an interrupted build leaves
 * none), is not a manifest, or lists a file that is not there. It does not compare hashes; the checks do.
 */
export const readManifest = Effect.fn("readManifest")(function* readManifest(
  dir: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const location = path.join(dir, manifestFile);

  const present = yield* Effect.mapError(fs.exists(location), (cause) =>
    refusal(dir, `cannot look for ${manifestFile}: ${cause.message}`)
  );

  if (!present) {
    return yield* refusal(
      dir,
      `${location} does not exist: ${dir} is not a finished build (a build that fails or is interrupted leaves no ${manifestFile})`
    );
  }

  const text = yield* Effect.mapError(fs.readFileString(location), (cause) =>
    refusal(dir, `cannot read ${location}: ${cause.message}`)
  );

  const manifest = yield* Effect.mapError(decodeManifest(text), (cause) =>
    refusal(dir, `${location} is not a build manifest: ${cause.message}`)
  );

  yield* Effect.forEach(
    manifest.files,
    (file) =>
      Effect.flatMap(
        Effect.mapError(fs.exists(path.join(dir, file.path)), (cause) =>
          refusal(dir, `cannot look for ${file.path}: ${cause.message}`)
        ),
        (exists) =>
          exists
            ? Effect.void
            : Effect.fail(
                refusal(
                  dir,
                  `${manifestFile} lists ${file.path}, which is missing`
                )
              )
      ),
    { discard: true }
  );

  return manifest;
});

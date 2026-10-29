// `build.json`, written last: its presence says the build finished. It lists every other file of the build with its
// SHA-256 and size, the hash of the source, every adapter the build selected with what it sends out (egress) and its
// settings, and the provenance of every cache asset the build used (spec 0001, F5 and F16). The declared field order
// is alphabetical so equal builds write equal text. The schema lives here, with the program that writes it:
// `@reebeat/verify` reads the same definition. No secret can be in it, and `writeManifest` does not check that: the
// names are refused where each setting enters, `selectedAdapters` in `buildProgram.ts` for the adapters' settings,
// `rejectSecretSettings` in `cache.put` and `cache.key` for an asset's, and `keyOf` in `speechStage.ts` for the
// aligner's inside a key's `extra`; `@reebeat/verify` (F5) checks every nested `settings` of the written file. The
// settings are what the adapters declare, never what they read from the environment.
import {
  EgressSchema,
  ProvenanceSchema,
  SettingsSchema,
  serviceNames,
} from "@reebeat/services";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Schema,
  String as Str,
} from "effect";

import { outputFailed } from "./errors.ts";
import { sha256Hex } from "./hash.ts";

export const manifestFile = "build.json";

/** One selected adapter: the service it fills, its id, what it sends out and the settings that shape its output. */
export const AdapterRecordSchema = Schema.Struct({
  egress: EgressSchema,
  id: Schema.String,
  service: Schema.Literals(serviceNames),
  settings: SettingsSchema,
});

export type AdapterRecord = typeof AdapterRecordSchema.Type;

export const BuildManifestSchema = Schema.Struct({
  /** Every adapter the build used, one per service, in the order of `serviceNames`. */
  adapters: Schema.Array(AdapterRecordSchema),
  /** The provenance of every cache asset the build used, one per distinct key, sorted by key. */
  assets: Schema.Array(ProvenanceSchema),
  files: Schema.Array(
    Schema.Struct({
      bytes: Schema.Int,
      path: Schema.String,
      sha256: Schema.String,
    })
  ),
  schema: Schema.Literal(2),
  /** Where the source was when it was built; shown, never read: `check` is told the source path. */
  sourcePath: Schema.String,
  /** SHA-256 of the bytes of the `.fountain` file. */
  sourceSha256: Schema.String,
});

export type BuildManifest = typeof BuildManifestSchema.Type;

const manifestJson = Schema.fromJsonString(BuildManifestSchema, { space: 2 });

/** Decodes the text of a `build.json`. */
export const decodeBuildManifest = Schema.decodeUnknownEffect(manifestJson);

/** Encodes a manifest as JSON text (two-space indent, keys in alphabetical order, no trailing newline). */
export const encodeBuildManifest = Schema.encodeEffect(manifestJson);

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
    Arr.map(files, (file) => Arr.join(Str.split(file, path.sep), "/")),
    Order.String
  );
});

export interface ManifestInput {
  readonly adapters: readonly AdapterRecord[];
  readonly assets: readonly (typeof ProvenanceSchema.Type)[];
  readonly source: { readonly path: string; readonly sha256: string };
}

/**
 * Writes `build.json` into `dir` for the files it holds now. Call it after every other file is written; the
 * manifest does not list itself.
 */
export const writeManifest = Effect.fn("writeManifest")(function* writeManifest(
  dir: string,
  input: ManifestInput
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

      return {
        bytes: bytes.byteLength,
        path: file,
        sha256: yield* sha256Hex(bytes),
      };
    })
  );

  const manifest: BuildManifest = {
    adapters: input.adapters,
    assets: input.assets,
    files,
    schema: 2,
    sourcePath: path.basename(input.source.path),
    sourceSha256: input.source.sha256,
  };

  const target = path.join(dir, manifestFile);

  yield* Effect.mapError(
    Effect.flatMap(encodeBuildManifest(manifest), (text) =>
      fs.writeFileString(target, text)
    ),
    outputFailed(target, "write")
  );

  return manifest;
});

// `build.json`, written last by `build`: the source hash and the hash and size of every file of the build directory
// (itself excluded). `check` refuses a directory without it and verifies each listed file (spec 0001, F5).
import { Schema } from "effect";

export const BuildManifestSchema = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      bytes: Schema.Int,
      path: Schema.String,
      sha256: Schema.String,
    })
  ),
  schema: Schema.Literal(1),
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

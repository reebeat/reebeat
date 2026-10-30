// The manifest of a finished build, as `check` and `journey` read it. The schema and the writer are the build
// program's (`@tsukuri/pipeline`): `build.json` is written last, so its presence says the build finished.
import { decodeBuildManifest, manifestFile } from "@tsukuri/pipeline";
import { Effect, FileSystem, Path } from "effect";

import { NotABuild } from "./errors.ts";

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

  const manifest = yield* Effect.mapError(decodeBuildManifest(text), (cause) =>
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

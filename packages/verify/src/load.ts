// What every check reads: the written files of a build directory and the source, loaded once. Nothing here comes
// from the pipeline that wrote them; the Plan is rebuilt from the source with the core's `buildPlan`.
import { buildPlan, decodePlan, requireTimeline } from "@reebeat/core";
import type { PlanError, PlanJson, TimedPlan } from "@reebeat/core";
import { decodeBuildManifest, sha256Hex } from "@reebeat/pipeline";
import type { BuildManifest } from "@reebeat/pipeline";
import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";
import type { Result } from "effect";
import type { Digest } from "effect/crypto";

import { BuildInvalid } from "./errors.ts";

/** The narrator the manifest lists, when it is a stand-in. */
const silentNarratorOf = (manifest: BuildManifest): Option.Option<string> =>
  Option.filter(
    Option.map(
      Arr.findFirst(
        manifest.adapters,
        (adapter) => adapter.service === "SpeechSynthesizer"
      ),
      (adapter) => adapter.id
    ),
    (id) => id.endsWith("-standin")
  );

interface SourceFile {
  readonly path: string;
  /** SHA-256 of the bytes of the file. */
  readonly sha256: string;
  readonly text: string;
}

export interface Build {
  readonly buildDir: string;
  /** The speech cache directory: `audio.file` of every Line is relative to it. */
  readonly cacheDir: string;
  readonly deckHtml: string;
  readonly manifest: BuildManifest;
  /** The path of `<name>.mp4`. */
  readonly mp4: string;
  /** `plan.json` as written, with its Timeline. */
  readonly plan: TimedPlan;
  /** The Plan the current source builds, or why it does not build. */
  readonly rebuilt: Result.Result<PlanJson, PlanError>;
  /**
   * The id of the narrator `build.json` lists when it is a stand-in whose narration is silent by construction (an id
   * ending `-standin`), else none. The one reason F8 reports N/A: the sounds of such a build are audible, F1 checks them.
   */
  readonly silentNarrator: Option.Option<string>;
  readonly source: SourceFile;
  /** The text of `<name>.vtt`. */
  readonly vtt: string;
}

export interface CheckOptions {
  readonly buildDir: string;
  /** Defaults to `speech-cache` beside the source. */
  readonly cacheDir?: string;
  readonly sourcePath: string;
}

const invalid = (path: string, message: string) => (cause: unknown) =>
  new BuildInvalid({ cause, message, path });

/** The one `<name>.mp4` of a build directory. */
export const locateMp4 = Effect.fn("locateMp4")(function* locate(
  buildDir: string
): Effect.fn.Return<string, BuildInvalid, FileSystem.FileSystem | Path.Path> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const names = yield* fs
    .readDirectory(buildDir)
    .pipe(
      Effect.mapError(invalid(buildDir, "cannot list the build directory"))
    );

  const [only, ...others] = Arr.filter(names, (name) => name.endsWith(".mp4"));

  if (only === undefined || others.length > 0) {
    return yield* new BuildInvalid({
      cause: undefined,
      message: `${buildDir} must hold exactly one .mp4`,
      path: buildDir,
    });
  }

  return path.join(buildDir, only);
});

const readText = (fs: FileSystem.FileSystem, path: string, what: string) =>
  Effect.mapError(
    fs.readFileString(path),
    invalid(path, `cannot read ${what}`)
  );

// A byte-order mark stays in the text, as in the CLI's read, so the hash of the bytes is the hash of the string.
const utf8 = new TextDecoder("utf-8", { ignoreBOM: true });

/** Loads the build directory and the source; fails with `BuildInvalid` when the directory cannot be checked. */
export const loadBuild = Effect.fn("loadBuild")(function* load(
  options: CheckOptions
): Effect.fn.Return<
  Build,
  BuildInvalid,
  FileSystem.FileSystem | Path.Path | Digest.Digest
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { buildDir, sourcePath } = options;
  const manifestPath = path.join(buildDir, "build.json");
  const planPath = path.join(buildDir, "plan.json");

  const manifest = yield* readText(
    fs,
    manifestPath,
    "build.json: is this a build directory?"
  ).pipe(
    Effect.flatMap((text) =>
      Effect.mapError(
        decodeBuildManifest(text),
        invalid(manifestPath, "build.json is not a build manifest")
      )
    )
  );

  const plan = yield* readText(fs, planPath, "plan.json").pipe(
    Effect.flatMap((text) =>
      Effect.mapError(
        decodePlan(text),
        invalid(planPath, "plan.json is not a Plan")
      )
    ),
    Effect.flatMap((decoded) =>
      Effect.mapError(
        Effect.fromResult(requireTimeline(decoded)),
        invalid(planPath, "plan.json has no usable Timeline")
      )
    )
  );

  const mp4 = yield* locateMp4(buildDir);
  const vttPath = path.join(buildDir, `${path.basename(mp4, ".mp4")}.vtt`);

  const deckHtml = yield* readText(
    fs,
    path.join(buildDir, "deck.html"),
    "deck.html"
  );

  const vtt = yield* readText(fs, vttPath, "the subtitles");

  const bytes = yield* Effect.mapError(
    fs.readFile(sourcePath),
    invalid(sourcePath, "cannot read the source")
  );

  const sha256 = yield* sha256Hex(bytes);

  const text = utf8.decode(bytes);
  const rebuilt = yield* Effect.result(buildPlan(text, sha256));

  return {
    buildDir,
    cacheDir:
      options.cacheDir ?? path.join(path.dirname(sourcePath), "speech-cache"),
    deckHtml,
    manifest,
    mp4,
    plan,
    rebuilt,
    silentNarrator: silentNarratorOf(manifest),
    source: { path: sourcePath, sha256, text },
    vtt,
  };
});

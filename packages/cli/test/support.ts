// Shared by the tests. The tests run the real CLI program (`run`) on the real file system, with the real adapters the
// selection picks (the offline stand-ins for narration, the real reveal.js Renderer and the real ffmpeg Encoder);
// only Chromium and the verification are replaced by fakes, through `Composition`, which is the seam the composition
// root offers. The environment the adapters read is a test's own `ConfigProvider`, never the machine's.
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { buildPlan } from "@reebeat/core";
import { MediaTools } from "@reebeat/encode-ffmpeg";
import { sha256Hex, speechStage } from "@reebeat/pipeline";
import { FrameCapturer, decodeSelection, localEgress } from "@reebeat/services";
import type { Selection, CaptureError } from "@reebeat/services";
import {
  Array as Arr,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
} from "effect";
import { TestConsole } from "effect/testing";

import { Composition, realParts, speechServicesOf } from "../src/adapters.ts";
import type { Parts, RunOptions } from "../src/adapters.ts";
import { run } from "../src/cli.ts";
import { Verifier } from "../src/verifier.ts";
import type { Status, Verdict } from "../src/verify.ts";

/** The platform services the tests run on: the tests' one runtime adapter. */
export const platform = NodeServices.layer;

/** Joins rows of a source text with newlines. */
const asText = (rows: readonly string[]): string => Arr.join(rows, "\n");

/** A story of two Scenes joined by `> AUTO-ANIMATE`, with a `[[next]]`, a `[[focus]]` and a `[[sfx]]`. */
export const storyText = asText([
  "Title: Cli",
  "Author: Test",
  "",
  "# Part",
  "",
  "INT. ONE",
  "",
  "Box {#a @mc .box}",
  "Later {#b @bc .label hidden}",
  "",
  "NARRATOR",
  "One two three. [[next]] Four five. [[sfx: pop]]",
  "",
  "> AUTO-ANIMATE",
  "",
  "INT. TWO",
  "",
  "Box {#a @tl .box}",
  "",
  "NARRATOR",
  "Six seven. [[focus: a]] Eight.",
  "",
]);

/** A directory that is removed when the test's scope closes. */
export const tempDirectory = Effect.gen(function* create() {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-cli-test-" });
});

/** The committed story of release 1 and its speech cache. */
export const sameId = Effect.gen(function* locate() {
  const path = yield* Path.Path;

  const directory = yield* path.fromFileUrl(
    new URL("../../../stories/same-id/", import.meta.url)
  );

  return {
    cache: path.join(directory, "speech-cache"),
    story: path.join(directory, "story.fountain"),
  };
});

/** Writes `content` to `name` in `dir` and returns the path. */
export const writeIn = Effect.fnUntraced(function* writeIn(
  dir: string,
  name: string,
  content: Uint8Array
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = path.join(dir, name);

  yield* fs.writeFile(target, content);

  return target;
});

/** Writes `text` as UTF-8, with no byte-order mark. */
export const writeText = (dir: string, name: string, text: string) =>
  writeIn(dir, name, new TextEncoder().encode(text));

/** A temporary directory holding `story.fountain` with the given text; returns the file's path. */
export const storyFile = Effect.fnUntraced(function* storyFile(
  text: string = storyText
) {
  return yield* writeText(yield* tempDirectory, "story.fountain", text);
});

/** The Plan of a story text. */
const planOf = (text: string) =>
  Effect.gen(function* build() {
    return yield* buildPlan(
      text,
      yield* sha256Hex(new TextEncoder().encode(text))
    );
  });

/** The selection of the offline stand-ins for narration: the silent narrator and the even aligner. */
export const standins: Effect.Effect<Selection> = Effect.orDie(
  decodeSelection({ aligner: "even", speech: "silent" })
);

/** Fills `cacheDir` with one asset per Line of `text`, made by the stand-ins (no model, real ffmpeg for the FLAC). */
export const fillCache = (cacheDir: string, text: string) =>
  Effect.gen(function* fill() {
    const parts = realParts(yield* standins, { cacheDir });

    yield* Effect.provide(
      speechStage(yield* planOf(text), { refresh: true }),
      speechServicesOf(parts)
    );
  });

/** A story file and a cache beside it filled by the stand-ins; `out` is where a build goes. */
export const storyWithCache = Effect.gen(function* setup() {
  const path = yield* Path.Path;
  const story = yield* storyFile();
  const dir = path.dirname(story);
  const cacheDir = path.join(dir, "speech-cache");

  yield* fillCache(cacheDir, storyText);

  return { cacheDir, dir, out: path.join(dir, "out"), story };
});

/** One solid PNG, small enough that the frames of a whole build are cheap. */
const solidPng = Effect.gen(function* png() {
  const tools = yield* MediaTools;

  return yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=64x36",
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-c:v",
    "png",
    "pipe:1",
  ]);
});

/** A FrameCapturer whose frames are `frames(count)` for a Plan of `count` frames; no Chromium starts. */
export const fakeCapturerWith = (
  frames: (count: number) => Stream.Stream<Uint8Array, CaptureError>
): Parts["capturer"] =>
  Layer.succeed(
    FrameCapturer,
    FrameCapturer.of({
      capture: ({ plan }) => frames(plan.timeline?.totalFrames ?? 0),
      frames: (plan) => plan.timeline?.totalFrames ?? 0,
      info: {
        egress: localEgress,
        id: "fake-capturer@1-standin",
        settings: {},
      },
    })
  );

/** A FrameCapturer that emits one solid picture per frame of the Plan. */
const solidCapturer: Parts["capturer"] = Layer.unwrap(
  Effect.map(Effect.orDie(solidPng), (png) =>
    fakeCapturerWith((count) =>
      Stream.fromIterable(Arr.makeBy(count, () => png))
    )
  )
).pipe(Layer.provide(MediaTools.layer));

export const verdict = (
  id: Verdict["id"],
  status: Status,
  detail = ""
): Verdict => ({ detail, id, measured: [], status });

/** A verifier that answers `checks` and `comparison` and records each question in `calls`. */
export const fakeVerifier = (
  checks: readonly Verdict[],
  comparison: Verdict,
  calls: string[]
): Layer.Layer<Verifier> =>
  Layer.succeed(
    Verifier,
    Verifier.of({
      check: (options) =>
        Effect.sync(() => {
          calls.push(`check ${options.buildDir} ${options.sourcePath}`);

          return checks;
        }),
      compare: (dirA, dirB) =>
        Effect.sync(() => {
          calls.push(`compare ${dirA} ${dirB}`);

          return comparison;
        }),
    })
  );

/** What `runCli` replaces: adapters, the verification, what the adapters may read from the environment. */
export interface Fakes {
  /** The FrameCapturer; default `solidCapturer`. */
  readonly capturer?: Parts["capturer"];
  /** The environment names and values the adapters can read; default none. */
  readonly env?: Readonly<Record<string, string>>;
  /** Read the real environment instead (`REEBEAT_CHROMIUM` and the like): for the run that drives the real Chromium. */
  readonly machineEnv?: boolean;
  /** Told what every `Composition` call was asked, before it answers. */
  readonly spy?: (selection: Selection, options: RunOptions) => void;
  /** The narrator in place of the selected one. */
  readonly speech?: Parts["speech"];
  /** The verification; default answers nothing and records nothing. */
  readonly verifier?: Parts["verifier"];
}

/** The layer that puts `fakes` in place of the adapters and the environment of a run. */
export const fakeWorld = (fakes: Fakes = {}) => {
  const compose = (selection: Selection, options: RunOptions): Parts => {
    fakes.spy?.(selection, options);

    const real = realParts(selection, options);

    return {
      ...real,
      capturer: fakes.capturer ?? solidCapturer,
      speech: fakes.speech ?? real.speech,
      verifier: fakes.verifier ?? fakeVerifier([], verdict("F6", "pass"), []),
    };
  };

  return Layer.mergeAll(
    Layer.succeed(Composition, compose),
    ConfigProvider.layer(
      fakes.machineEnv === true
        ? ConfigProvider.fromEnv()
        : ConfigProvider.fromUnknown(fakes.env ?? {})
    )
  );
};

/** Runs `reebeat <args>` and returns how it ended with everything it printed. */
export const runCli = (args: readonly string[], fakes: Fakes = {}) =>
  Effect.gen(function* execute() {
    const exit = yield* Effect.exit(run(args));

    return {
      exit,
      stderr: Arr.join(Arr.map(yield* TestConsole.errorLines, String), "\n"),
      stdout: Arr.join(Arr.map(yield* TestConsole.logLines, String), "\n"),
    };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(Layer.fresh(TestConsole.layer), fakeWorld(fakes))
    )
  );

/** The story and output directory of a `storyWithCache`. */
interface BuildSetup {
  readonly out: string;
  readonly story: string;
}

/** Runs `reebeat build <story> --out <out> <extra>`. */
export const runBuild = (
  setup: BuildSetup,
  extra: readonly string[] = [],
  fakes: Fakes = {}
) => runCli(["build", setup.story, "--out", setup.out, ...extra], fakes);

/** A story in its own directory and where its build and cache would go. */
export const storySetup = Effect.gen(function* create() {
  const path = yield* Path.Path;
  const story = yield* storyFile();
  const dir = path.dirname(story);

  return {
    cache: path.join(dir, "speech-cache"),
    dir,
    out: path.join(dir, "out"),
    story,
  };
});

/** Asserts that a failed build left no output, no partial directory and no cache entry (not even a stand-in's). */
export const leftNothing = Effect.fnUntraced(function* leftNothing(where: {
  readonly cache: string;
  readonly out: string;
}) {
  const fs = yield* FileSystem.FileSystem;

  assert.isFalse(yield* fs.exists(where.out), `${where.out} must not exist`);
  assert.isFalse(yield* fs.exists(`${where.out}.partial`));
  assert.isFalse(
    yield* fs.exists(where.cache),
    `${where.cache} must not exist`
  );
});

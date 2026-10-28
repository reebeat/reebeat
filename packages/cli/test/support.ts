// Shared by the tests. The tests run the real CLI program (`run`) on the real file system and a real ffmpeg; only
// Chromium and the verification are replaced by fakes, through the services the composition root would choose.
import { NodeServices } from "@effect/platform-node";
import { buildPlan } from "@reebeat/core";
import type { PlanJson } from "@reebeat/core";
import {
  SpeechCache,
  sha256Hex,
  speechCacheFiles,
  speechKey,
  speechParams,
} from "@reebeat/speech";
import type { CacheEntry } from "@reebeat/speech";
import { Browser, MediaTools } from "@reebeat/video";
import type { BrowserFailed, DeckPage } from "@reebeat/video";
import { Array as Arr, Effect, FileSystem, Layer, Path } from "effect";
import { TestConsole } from "effect/testing";

import { run } from "../src/cli.ts";
import { Verifier } from "../src/verifier.ts";
import type { Verdict } from "../src/verify.ts";

/** The platform services the tests run on: the tests' one runtime adapter. */
export const platform = NodeServices.layer;

/** Joins rows of a source text with newlines. */
const asText = (rows: readonly string[]): string => Arr.join(rows, "\n");

/** A story of two Scenes joined by `> AUTO-ANIMATE`, with a `[[next]]`, a `[[focus]]` and a `[[sfx]]`, about 6 s. */
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

/** The Plan of `storyText`. */
export const planOf = (text: string) =>
  Effect.gen(function* build() {
    return yield* buildPlan(
      text,
      yield* sha256Hex(new TextEncoder().encode(text))
    );
  });

/** The Lines of a Plan, in order. */
const linesOf = (plan: PlanJson) =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** The cache key of every Line of a Plan, in order. */
export const keysOf = (plan: PlanJson) =>
  Effect.forEach(linesOf(plan), (line) =>
    Effect.map(
      speechKey(speechParams({ speed: line.hints.speed, text: line.text })),
      (key) => ({ key, lineId: line.id })
    )
  );

/**
 * Fills `cacheDir` with one entry per Line of the Plan: real FLAC audio (noise, 300 ms per word) and words 300 ms
 * apart, stored the way the speech package stores them, so `speechCacheOnly` reads them as hits.
 */
export const fillCache = (cacheDir: string, plan: PlanJson) =>
  Effect.forEach(
    linesOf(plan),
    (line) =>
      Effect.gen(function* entry() {
        const tools = yield* MediaTools;
        const cache = yield* SpeechCache;

        const params = speechParams({
          speed: line.hints.speed,
          text: line.text,
        });

        const durationMs = line.words.length * 300;

        const flac = yield* tools.run("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          `anoisesrc=color=white:seed=7:amplitude=0.4:duration=${durationMs / 1000}:sample_rate=24000`,
          "-ac",
          "1",
          "-c:a",
          "flac",
          "-f",
          "flac",
          "pipe:1",
        ]);

        const stored: CacheEntry = {
          audioSha256: yield* sha256Hex(flac),
          durationMs,
          key: yield* speechKey(params),
          match: 1,
          params,
          words: Arr.map(line.words, (w, index) => ({
            endMs: index * 300 + 280,
            startMs: index * 300,
            w,
          })),
        };

        yield* cache.put(stored, flac);
      }).pipe(Effect.provide(speechCacheFiles(cacheDir))),
    { discard: true }
  ).pipe(Effect.provide(MediaTools.layer));

/** A story file and a filled cache beside it, in one temporary directory; `out` is where a build goes. */
export const storyWithCache = Effect.gen(function* setup() {
  const path = yield* Path.Path;
  const story = yield* storyFile();
  const dir = path.dirname(story);
  const cacheDir = path.join(dir, "speech-cache");

  yield* fillCache(cacheDir, yield* planOf(storyText));

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

const pageWith = (
  screenshot: Effect.Effect<Uint8Array, BrowserFailed>
): DeckPage => ({
  clockGoTo: () => Effect.void,
  command: () => Effect.void,
  ready: Effect.void,
  screenshot,
  seek: () => Effect.void,
});

/** A browser whose every screenshot is `screenshot`; no Chromium starts. */
export const fakeBrowser = (
  screenshot: Effect.Effect<Uint8Array, BrowserFailed>
) =>
  Layer.succeed(
    Browser,
    Browser.of({ open: () => Effect.succeed(pageWith(screenshot)) })
  );

/** A browser that shows one solid picture. */
export const solidBrowser = Layer.unwrap(
  Effect.map(Effect.orDie(solidPng), (png) => fakeBrowser(Effect.succeed(png)))
);

/** A browser that never answers a screenshot: a capture can only end by its deadline. */
export const hangingBrowser = fakeBrowser(Effect.never);

export const verdict = (
  id: Verdict["id"],
  ok: boolean,
  detail = ""
): Verdict => ({ detail, id, measured: [], ok });

/** A verifier that answers `checks` and `comparison` and records each question in `calls`. */
export const fakeVerifier = (
  checks: readonly Verdict[],
  comparison: Verdict,
  calls: string[]
) =>
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

/** What `runCli` replaces: the browser (no Chromium starts) and the verification. */
export interface Fakes {
  readonly browser?: Layer.Layer<Browser, never, MediaTools>;
  readonly verifier?: Layer.Layer<Verifier>;
}

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
      Layer.mergeAll(
        Layer.fresh(TestConsole.layer),
        fakes.verifier ?? fakeVerifier([], verdict("F6", true), []),
        Layer.provideMerge(fakes.browser ?? solidBrowser, MediaTools.layer)
      )
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

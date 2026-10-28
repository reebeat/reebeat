// What the integration tests share: a small story built end to end with the real packages (parse, schedule, deck,
// capture in Chromium, mux with ffmpeg) into a build directory, and the helpers that copy it, change one file of the
// copy and run the checks. The speech cache holds seeded noise as narration, as in the video package's tests.
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { buildPlan, encodePlan, schedule } from "@reebeat/core";
import type { AlignedLine, PlanJson } from "@reebeat/core";
import { renderDeck, writeDeck } from "@reebeat/deck";
import { sfxWav } from "@reebeat/sfx";
import {
  Browser,
  MediaTools,
  captureFrames,
  captureSchedule,
  muxVideo,
  requireTimeline,
} from "@reebeat/video";
import type {
  BrowserFailed,
  CaptureTimeout,
  MediaToolFailed,
  OutputFailed,
  TimedPlan,
} from "@reebeat/video";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Result,
  Stream,
} from "effect";
import type { PlatformError } from "effect";

import { sha256Hex } from "../src/hash.ts";
import { renderVerdicts, runChecks } from "../src/index.ts";
import type { Verdict } from "../src/index.ts";
import { encodeBuildManifest } from "../src/manifest.ts";

/** The services of a real run: ffmpeg, Chromium, the file system and hashing. */
const services = Layer.mergeAll(MediaTools.layer, Browser.layer).pipe(
  Layer.provideMerge(NodeServices.layer)
);

/**
 * Two Sections, two Scenes, 156 frames: a Line with a `next` and an `sfx`, then an Auto-Animate Scene in which one
 * Element moves and changes class, one enters and one exits, with a `focus`.
 */
export const storyText = `Title: Fixture story
Author: reebeat tests

# Part one

INT. ONE - DAY

Box {#a @tl .box}
Later {#b @br .label hidden}

NARRATOR
One two [[next]] three four. [[sfx: pop]]

# Part two

> AUTO-ANIMATE

INT. TWO - DAY

Box {#a @br .box .accent}
Entering {#d @tl .label}

NARRATOR
Five [[focus: a]] six seven.
`;

export const buildName = "story";

const wordMs = 300;

const encoder = new TextEncoder();

const linesOf = (plan: PlanJson) =>
  Arr.flatMap(plan.scenes, (scene) => scene.lines);

/** Each word is 300 ms long, spoken in its first 280 ms: the same shape as the video package's fixture. */
const alignedLines = (plan: PlanJson): readonly AlignedLine[] =>
  Arr.map(linesOf(plan), (line) => ({
    audio: { file: `${line.id}.flac`, sha256: "00" },
    durationMs: line.words.length * wordMs,
    lineId: line.id,
    words: Arr.map(line.words, (w, index) => ({
      endMs: index * wordMs + 280,
      startMs: index * wordMs,
      w,
    })),
  }));

const noiseFlac = Effect.fnUntraced(function* noiseFlac(
  file: string,
  seed: number,
  seconds: number
) {
  const tools = yield* MediaTools;

  yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=color=white:seed=${seed}:amplitude=0.4:duration=${seconds}:sample_rate=24000`,
    "-ac",
    "1",
    "-c:a",
    "flac",
    file,
  ]);
});

/** Every file below `dir`, relative to it, in name order. */
const filesBelow = Effect.fnUntraced(function* filesBelow(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.readDirectory(dir, { recursive: true });

  const stats = yield* Effect.forEach(names, (name) =>
    Effect.map(fs.stat(path.join(dir, name)), (info) => ({ info, name }))
  );

  return Arr.sort(
    Arr.map(
      Arr.filter(stats, ({ info }) => info.type === "File"),
      ({ name }) => name
    ),
    Order.String
  );
});

/** Writes `build.json` for the files now in `dir`: what `build` does last, and what a mutation must redo to stay consistent. */
export const sealBuild = Effect.fn("sealBuild")(function* seal(
  dir: string,
  sourcePath: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* fs.readFile(sourcePath);

  const files = yield* Effect.forEach(
    Arr.filter(yield* filesBelow(dir), (name) => name !== "build.json"),
    (name) =>
      Effect.gen(function* entry() {
        const bytes = yield* fs.readFile(path.join(dir, name));

        return {
          bytes: bytes.byteLength,
          path: name,
          sha256: yield* sha256Hex(bytes),
        };
      })
  );

  yield* fs.writeFileString(
    path.join(dir, "build.json"),
    yield* encodeBuildManifest({
      files,
      schema: 1,
      sourcePath: path.basename(sourcePath),
      sourceSha256: yield* sha256Hex(source),
    })
  );
});

export interface FixtureData {
  /** The intact build directory. */
  readonly build: string;
  readonly cacheDir: string;
  /** The captured PNG frames of the intact build. */
  readonly frames: readonly Uint8Array[];
  readonly plan: TimedPlan;
  readonly root: string;
  readonly sourcePath: string;
}

const timedOrDie = (plan: PlanJson): TimedPlan =>
  Result.getOrThrow(requireTimeline(plan));

const buildFixture = Effect.gen(function* buildFixtureDirectory() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-verify-" });
  const sourcePath = path.join(root, "story", "story.fountain");
  const cacheDir = path.join(root, "story", "speech-cache");
  const build = path.join(root, "build");

  yield* fs.makeDirectory(cacheDir, { recursive: true });
  yield* fs.makeDirectory(path.join(build, "assets", "sfx"), {
    recursive: true,
  });
  yield* fs.writeFileString(sourcePath, storyText);

  const plan = yield* buildPlan(
    storyText,
    yield* sha256Hex(encoder.encode(storyText))
  );

  const aligned = alignedLines(plan);
  const scheduled = yield* schedule(plan, aligned);
  const timed = timedOrDie(scheduled);

  yield* Effect.forEach(aligned, (line, index) =>
    noiseFlac(
      path.join(cacheDir, line.audio.file),
      11 * (index + 1),
      line.durationMs / 1000
    )
  );

  yield* writeDeck(renderDeck(scheduled), build, scheduled);
  yield* Effect.forEach(["pop", "whoosh", "ding"] as const, (name) =>
    fs.writeFile(path.join(build, "assets", "sfx", `${name}.wav`), sfxWav(name))
  );

  const frames = yield* Stream.runCollect(
    captureFrames(captureSchedule(timed), {
      deckUrl: (yield* path.toFileUrl(path.join(build, "deck.html"))).href,
      settleNewAnimations: true,
    })
  );

  yield* muxVideo(timed, Stream.fromIterable(frames), {
    cacheDir,
    name: buildName,
    outDir: build,
  });
  yield* fs.writeFileString(
    path.join(build, "plan.json"),
    yield* encodePlan(scheduled)
  );
  yield* sealBuild(build, sourcePath);

  return { build, cacheDir, frames, plan: timed, root, sourcePath };
});

/** The small build, made once per test block. */
export class Fixture extends Context.Service<Fixture, FixtureData>()(
  "@reebeat/verify/test/Fixture"
) {
  static readonly layer = Layer.effect(Fixture, buildFixture).pipe(
    Layer.provideMerge(services)
  );
}

/** A copy of the intact build in a new directory of the fixture's root. */
export const copyBuild = Effect.fn("copyBuild")(function* copy(name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* Fixture;
  const target = path.join(fixture.root, name);

  yield* fs.copy(fixture.build, target);

  return target;
});

/** The checks on a directory of the fixture's story. */
export const checkDirectory = (dir: string, sourcePath?: string) =>
  Effect.flatMap(Fixture, (fixture) =>
    runChecks({
      buildDir: dir,
      cacheDir: fixture.cacheDir,
      sourcePath: sourcePath ?? fixture.sourcePath,
    })
  );

/** The ids of the verdicts that do not hold. */
export const failedIds = (verdicts: readonly Verdict[]): readonly string[] =>
  Arr.map(
    Arr.filter(verdicts, (verdict) => !verdict.ok),
    (verdict) => verdict.id
  );

/** The verdict of one falsifier. */
export const verdictOf = (
  verdicts: readonly Verdict[],
  id: Verdict["id"]
): Verdict =>
  Option.getOrThrow(Arr.findFirst(verdicts, (verdict) => verdict.id === id));

/** Rewrites a text file with `change` and asserts that it changed. */
export const editFile = Effect.fn("editFile")(function* edit(
  file: string,
  change: (text: string) => string
) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file);
  const changed = change(text);

  assert.notStrictEqual(changed, text, `${file} was not changed`);
  yield* fs.writeFileString(file, changed);
});

/** Replaces the first occurrence of `from` in a text file. */
export const replaceInFile = (file: string, from: string, to: string) =>
  editFile(file, (text) => {
    assert.include(text, from, file);

    return text.replace(from, to);
  });

/** Runs ffmpeg with `args` and ignores its output. */
export const ffmpeg = Effect.fnUntraced(function* ffmpeg(
  args: readonly string[]
) {
  const tools = yield* MediaTools;

  yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
  ]);
});

/** The mp4 of a build directory. */
export const mp4Of = (dir: string) =>
  Effect.map(Path.Path, (path) => path.join(dir, `${buildName}.mp4`));

/**
 * Writes a new mp4 from the mp4 of `dir` (input 0) with `inputs` as further inputs and `args` as the mapping and
 * codec arguments, and moves it over the mp4. The mp4 is the only file of the directory that changes.
 */
export const rewriteMp4 = Effect.fn("rewriteMp4")(function* rewrite(
  dir: string,
  inputs: readonly string[],
  args: readonly string[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const mp4 = path.join(dir, `${buildName}.mp4`);
  const scratch = path.join(dir, "rewrite.mp4");

  yield* ffmpeg([
    "-i",
    mp4,
    ...Arr.flatMap(inputs, (input) => ["-i", input]),
    ...args,
    scratch,
  ]);
  yield* fs.rename(scratch, mp4);
});

const packageFile = (...relative: readonly string[]) =>
  Effect.gen(function* resolveFile() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(
      path.resolve(import.meta.dirname, "..", ...relative)
    );
  }).pipe(Effect.provide(NodeServices.layer));

/** The text of a file of the package under test, by path relative to the package (`package.json`). */
export const readPackageText = (relative: string) => packageFile(relative);

/** The name and text of every `.ts` file under `src`. */
export const readSources = Effect.gen(function* sources() {
  const names = yield* Effect.flatMap(Path.Path, (path) =>
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      fs.readDirectory(path.resolve(import.meta.dirname, "..", "src"))
    )
  );

  const texts = yield* Effect.forEach(
    Arr.filter(names, (name) => name.endsWith(".ts")),
    (name) => Effect.map(packageFile("src", name), (text) => ({ name, text }))
  );

  return texts;
}).pipe(Effect.provide(NodeServices.layer));

/** The slide frame of a Scene in the Timeline. */
export const slideFrameOf = (plan: TimedPlan, sceneId: string): number =>
  Option.getOrThrow(
    Arr.findFirst(plan.timeline.scenes, (scene) => scene.sceneId === sceneId)
  ).slideFrame;

/** The ffmpeg stream mapping of a rewrite: video and audio of the mp4, `subtitles` and chapters from the named inputs. */
export const mapping = (subtitles: string, chapters: string): string[] => [
  "-map",
  "0:v",
  "-map",
  "0:a",
  "-map",
  subtitles,
  "-map_chapters",
  chapters,
  "-map_metadata",
  "0",
  "-movflags",
  "+faststart",
];

/** What a mutation of a copied build may fail with, and what it may use. */
type MutationError =
  | BrowserFailed
  | CaptureTimeout
  | MediaToolFailed
  | OutputFailed
  | PlatformError.PlatformError;

type MutationServices =
  | Browser
  | FileSystem.FileSystem
  | Fixture
  | MediaTools
  | Path.Path;

/** Muxes `frames` under the intact build's Plan into the mp4 and `.vtt` of `dir`, replacing the video. */
export const muxFrames = Effect.fn("muxFrames")(function* mux<R>(
  dir: string,
  frames: Stream.Stream<Uint8Array, BrowserFailed | CaptureTimeout, R>
) {
  const fixture = yield* Fixture;

  yield* muxVideo(fixture.plan, frames, {
    cacheDir: fixture.cacheDir,
    name: buildName,
    outDir: dir,
  });
});

/** Logs the verdicts that do not hold, as the table the CLI prints. */
export const logFailures = (verdicts: readonly Verdict[]) =>
  Effect.log(renderVerdicts(Arr.filter(verdicts, (verdict) => !verdict.ok)));

/**
 * One negative control: a copy of the intact build, `change` applied to it, `build.json` sealed again, the checks run.
 * The falsifiers that fail are exactly `expected`; the failing verdicts are logged. Returns every verdict.
 */
export const control = Effect.fn("control")(function* control(
  name: string,
  change: (dir: string) => Effect.Effect<void, MutationError, MutationServices>,
  expected: readonly string[]
) {
  const fixture = yield* Fixture;
  const dir = yield* copyBuild(name);

  yield* change(dir);
  yield* sealBuild(dir, fixture.sourcePath);

  const verdicts = yield* checkDirectory(dir);

  yield* logFailures(verdicts);
  assert.deepStrictEqual(failedIds(verdicts), expected);

  return verdicts;
});

/** `name: value` for every measured value of a verdict. */
export const measuredOf = (verdict: Verdict): readonly string[] =>
  Arr.map(verdict.measured, ([name, value]) => `${name}: ${value}`);

// What the integration tests share: a small story built end to end by the real build program over the real adapters
// (parse, schedule, reveal.js deck, capture in Chromium, mux with ffmpeg, a filesystem cache) into a build directory,
// and the helpers that copy it, change one file of the copy and run the checks. The narrator is a test synthesiser
// whose "speech" is seeded noise, so the narration is audible to the checks (the silent stand-in is not).
import { NodeServices } from "@effect/platform-node";
import { assert } from "@effect/vitest";
import { fsAssetCache } from "@reebeat/cache-fs";
import { chromiumCapturer } from "@reebeat/capture-chromium";
import { decodePlan, requireTimeline } from "@reebeat/core";
import type { PlanJson, TimedCue, TimedPlan } from "@reebeat/core";
import { MediaTools, ffmpegEncoder } from "@reebeat/encode-ffmpeg";
import type { MediaToolFailed } from "@reebeat/encode-ffmpeg";
import {
  buildProgram,
  decodeBuildManifest,
  encodeBuildManifest,
  muxStage,
  sha256Hex,
} from "@reebeat/pipeline";
import type { BuildOutputFailed, SpeechAssetInvalid } from "@reebeat/pipeline";
import { revealRenderer } from "@reebeat/render-reveal";
import {
  EmptyText,
  FrameCapturer,
  SpeechSynthesizer,
  localEgress,
} from "@reebeat/services";
import type {
  CacheError,
  CaptureFailure,
  EncodeError,
  InvalidOutputName,
  UnknownSound,
} from "@reebeat/services";
import { evenAligner, silentSynthesizer } from "@reebeat/services/standins";
import { sfxNames, sfxWav, synthSounds } from "@reebeat/sounds-synth";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Ref,
  Stream,
} from "effect";
import type { PlatformError } from "effect";

import { renderVerdicts, runChecks } from "../src/index.ts";
import type { Verdict } from "../src/index.ts";
import { timedLines } from "../src/planParts.ts";

/** The services the checks and the helpers run on: ffmpeg, the file system and hashing. */
const services = MediaTools.layer.pipe(Layer.provideMerge(NodeServices.layer));

/**
 * Two Sections, two Scenes: a Line with a `next` and an `sfx`, then an Auto-Animate Scene whose first Line opens with
 * a `whoosh` (anchored to the scene change) and in which one Element moves and changes class, one enters and one
 * exits, with a `focus`.
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
[[sfx: whoosh]] Five [[focus: a]] six seven.
`;

/** Two Scenes joined by a `> CUT`: the picture changes at once or F7's cut check fails. */
const cutStoryText = `Title: Cut story
Author: reebeat tests

# Part one

INT. ONE - DAY

Box {#a @tl .box}
Left {#b @ml .label}

NARRATOR
One two three four.

# Part two

> CUT

INT. TWO - DAY

Other {#d @br .title}
Later {#e @bl .label hidden}

NARRATOR
Five [[next]] six seven.
`;

export const buildName = "story";

const wordMs = 300;

const spokenMs = 280;

const sampleRate = 24_000;

const noiseAmplitude = 0.4;

/** A white-noise sample in `[-amplitude, amplitude]`: a hash of the position and the seed, so equal input is equal output. */
const noiseAt = (seed: number, index: number): number => {
  const scrambled = Math.sin(index * 12.9898 + seed * 78.233) * 43_758.5453;

  return (2 * (scrambled - Math.floor(scrambled)) - 1) * noiseAmplitude;
};

/** A seed of the text: the sum of its characters modulo a prime, so every Line has its own noise. */
const seedOf = (text: string): number =>
  Arr.reduce(
    text.split(""),
    17,
    (sum, char) => (sum * 31 + (char.codePointAt(0) ?? 0)) % 9973
  );

/**
 * The test narrator: seeded noise, 300 ms a word, with the word times a real aligner would find (each word spoken in
 * its first 280 ms). Its id does not end `-standin`, so the checks treat it as audible.
 */
const noiseSynthesizer = Layer.succeed(
  SpeechSynthesizer,
  SpeechSynthesizer.of({
    info: {
      egress: localEgress,
      id: "test-noise@1",
      settings: { amplitude: noiseAmplitude, wordMs },
    },
    synthesize: Effect.fn("noiseSynthesizer.synthesize")(function* speak({
      text,
    }) {
      const [first, ...rest] = Arr.filter(
        Arr.fromIterable(text.split(/\s+/u)),
        (word) => word !== ""
      );

      if (first === undefined) {
        return yield* new EmptyText({ message: "there are no words to speak" });
      }

      const spoken = [first, ...rest];
      const seed = seedOf(text);

      return {
        clip: {
          sampleRate,
          samples: Float32Array.from(
            { length: (spoken.length * wordMs * sampleRate) / 1000 },
            (_, index) => noiseAt(seed, index)
          ),
        },
        words: Arr.map(spoken, (_, index) => ({
          endMs: index * wordMs + spokenMs,
          startMs: index * wordMs,
        })),
      };
    }),
  })
);

/** Chromium that also keeps every frame it captures in `frames`, so a control can edit the frames of the intact build. */
const recordingCapturer = (frames: Ref.Ref<readonly Uint8Array[]>) =>
  Layer.effect(
    FrameCapturer,
    Effect.gen(function* recording() {
      const inner = yield* FrameCapturer;

      return FrameCapturer.of({
        ...inner,
        capture: (request) =>
          Stream.tap(inner.capture(request), (frame) =>
            Ref.update(frames, (all) => [...all, frame])
          ),
      });
    })
  ).pipe(Layer.provide(chromiumCapturer));

/** The real adapters of a build over the cache in `cacheDir`; the capturer records into `frames` when it is given. */
const adapters = (
  cacheDir: string,
  narrator: Layer.Layer<SpeechSynthesizer>,
  frames?: Ref.Ref<readonly Uint8Array[]>
) =>
  Layer.mergeAll(
    narrator,
    evenAligner,
    synthSounds,
    revealRenderer,
    frames === undefined ? chromiumCapturer : recordingCapturer(frames),
    ffmpegEncoder,
    fsAssetCache(cacheDir)
  ).pipe(Layer.provide(NodeServices.layer));

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

export interface FixtureData {
  /** The intact build directory. */
  readonly build: string;
  readonly cacheDir: string;
  /** The `file://` URL of the intact build's `deck.html`. */
  readonly deckUrl: string;
  /** The captured PNG frames of the intact build. */
  readonly frames: readonly Uint8Array[];
  readonly plan: TimedPlan;
  readonly root: string;
  readonly sourcePath: string;
}

const timedOrDie = (plan: PlanJson) => Effect.fromResult(requireTimeline(plan));

const buildFixture = Effect.fnUntraced(function* buildFixtureDirectory(
  narrator: Layer.Layer<SpeechSynthesizer>,
  story: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-verify-" });
  const sourcePath = path.join(root, "story", "story.fountain");
  const cacheDir = path.join(root, "story", "speech-cache");
  const build = path.join(root, "build");
  const frames = yield* Ref.make<readonly Uint8Array[]>([]);

  yield* fs.makeDirectory(cacheDir, { recursive: true });
  yield* fs.makeDirectory(path.join(root, "sounds"), { recursive: true });
  yield* fs.writeFileString(sourcePath, story);
  yield* Effect.forEach(
    sfxNames,
    (name) =>
      fs.writeFile(path.join(root, "sounds", `${name}.wav`), sfxWav(name)),
    { discard: true }
  );

  yield* Effect.provide(
    buildProgram({
      name: buildName,
      out: build,
      refreshSpeech: true,
      story: sourcePath,
    }),
    adapters(cacheDir, narrator, frames)
  );

  const plan = yield* timedOrDie(
    yield* decodePlan(yield* fs.readFileString(path.join(build, "plan.json")))
  );

  return {
    build,
    cacheDir,
    deckUrl: (yield* path.toFileUrl(path.join(build, "deck.html"))).href,
    frames: yield* Ref.get(frames),
    plan,
    root,
    sourcePath,
  };
});

/** The small build, made once per test block. */
export class Fixture extends Context.Service<Fixture, FixtureData>()(
  "@reebeat/verify/test/Fixture"
) {
  static readonly layer = Layer.effect(
    Fixture,
    buildFixture(noiseSynthesizer, storyText)
  ).pipe(Layer.provideMerge(services));

  /** The same story built offline: the silent stand-in narrates, so the narration is silent and the sounds are real. */
  static readonly offlineLayer = Layer.effect(
    Fixture,
    buildFixture(silentSynthesizer, storyText)
  ).pipe(Layer.provideMerge(services));

  /** A story with a `> CUT` into its second Scene, built offline (only the scene change is under test). */
  static readonly cutLayer = Layer.effect(
    Fixture,
    buildFixture(silentSynthesizer, cutStoryText)
  ).pipe(Layer.provideMerge(services));
}

/**
 * Writes `build.json` for the files now in `dir`: what `build` does last, and what a mutation must redo to stay
 * consistent. The adapters and the assets are those of the intact build; the files and the source hash are the
 * directory's and `sourcePath`'s now.
 */
export const sealBuild = Effect.fn("sealBuild")(function* seal(
  dir: string,
  sourcePath: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* Fixture;
  const source = yield* fs.readFile(sourcePath);

  const intact = yield* decodeBuildManifest(
    yield* fs.readFileString(path.join(fixture.build, "build.json"))
  );

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
      ...intact,
      files,
      sourcePath: path.basename(sourcePath),
      sourceSha256: yield* sha256Hex(source),
    })
  );
});

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

/** The verdicts that do not hold. */
const failing = (verdicts: readonly Verdict[]): readonly Verdict[] =>
  Arr.filter(verdicts, (verdict) => verdict.status === "fail");

/** The ids of the verdicts that do not hold. */
export const failedIds = (verdicts: readonly Verdict[]): readonly string[] =>
  Arr.map(failing(verdicts), (verdict) => verdict.id);

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
  | BuildOutputFailed
  | CacheError
  | CaptureFailure
  | EncodeError
  | InvalidOutputName
  | MediaToolFailed
  | PlatformError.PlatformError
  | SpeechAssetInvalid
  | UnknownSound;

type MutationServices =
  | FileSystem.FileSystem
  | Fixture
  | MediaTools
  | Path.Path;

/** The plan with `change` applied to the timed Cue `cueId`. */
const changeCue = (
  plan: TimedPlan,
  cueId: string,
  change: (cue: TimedCue) => TimedCue
): TimedPlan => ({
  ...plan,
  timeline: {
    ...plan.timeline,
    scenes: Arr.map(plan.timeline.scenes, (scene) => ({
      ...scene,
      lines: Arr.map(scene.lines, (line) => ({
        ...line,
        cues: Arr.map(line.cues, (cue) =>
          cue.cueId === cueId ? change(cue) : cue
        ),
      })),
    })),
  },
});

/** The plan with the command frame of one Cue moved by `frames`. */
export const shiftCommand = (
  plan: TimedPlan,
  cueId: string,
  frames: number
): TimedPlan =>
  changeCue(plan, cueId, (cue) => ({
    ...cue,
    commandFrame: cue.commandFrame + frames,
  }));

/** The plan with the slide frame of one Scene moved by `frames`: its scene change is commanded that much later. */
export const shiftSlide = (
  plan: TimedPlan,
  sceneId: string,
  frames: number
): TimedPlan => ({
  ...plan,
  timeline: {
    ...plan.timeline,
    scenes: Arr.map(plan.timeline.scenes, (scene) =>
      scene.sceneId === sceneId
        ? { ...scene, slideFrame: scene.slideFrame + frames }
        : scene
    ),
  },
});

/** The plan with the fire and command frames of one Cue set to `frame` (an `sfx` is mixed at its fire frame). */
export const moveFire = (
  plan: TimedPlan,
  cueId: string,
  frame: number
): TimedPlan =>
  changeCue(plan, cueId, (cue) => ({
    ...cue,
    commandFrame: frame,
    fireFrame: frame,
  }));

/** The capturer the controls re-capture with: Chromium over the platform. */
const capturing = chromiumCapturer.pipe(Layer.provide(NodeServices.layer));

/**
 * A new capture of the intact build's deck (or of the deck in `deckDir`), commanded by the schedule of `plan`, as the
 * frames to mux.
 */
export const recapture = (plan: TimedPlan, deckDir?: string) =>
  Stream.unwrap(
    Effect.gen(function* capture() {
      const fixture = yield* Fixture;

      const frames = yield* Effect.provide(
        Effect.flatMap(FrameCapturer, (capturer) =>
          Effect.scoped(
            Stream.runCollect(
              capturer.capture({ deckDir: deckDir ?? fixture.build, plan })
            )
          )
        ),
        capturing
      );

      return Stream.fromIterable(frames);
    })
  );

/** What muxing frames under the intact build's Plan needs besides the platform: the sounds, ffmpeg and the cache. */
const muxing = (cacheDir: string) =>
  Layer.mergeAll(synthSounds, ffmpegEncoder, fsAssetCache(cacheDir)).pipe(
    Layer.provide(NodeServices.layer)
  );

/**
 * Muxes `frames` under a Plan (the intact build's by default) into the mp4 and `.vtt` of `dir`, replacing the video;
 * the narration and the sounds are placed by that Plan's Timeline.
 */
export const muxFrames = Effect.fn("muxFrames")(function* mux(
  dir: string,
  frames: Stream.Stream<Uint8Array, CaptureFailure, Fixture>,
  plan?: TimedPlan
) {
  const fixture = yield* Fixture;

  yield* Effect.provide(
    muxStage(
      plan ?? fixture.plan,
      Stream.provideService(frames, Fixture, fixture),
      { name: buildName, outDir: dir }
    ),
    muxing(fixture.cacheDir)
  );
});

/** Logs the verdicts that do not hold, as the table the CLI prints. */
export const logFailures = (verdicts: readonly Verdict[]) =>
  Effect.log(renderVerdicts(failing(verdicts)));

/** A copy of the intact build with `change` applied to it and `build.json` sealed again, and the checks run on it. */
export const mutate = Effect.fn("mutate")(function* mutate(
  name: string,
  change: (dir: string) => Effect.Effect<void, MutationError, MutationServices>
) {
  const fixture = yield* Fixture;
  const dir = yield* copyBuild(name);

  yield* change(dir);
  yield* sealBuild(dir, fixture.sourcePath);

  const verdicts = yield* checkDirectory(dir);

  yield* logFailures(verdicts);

  return verdicts;
});

/**
 * One negative control: `mutate`, and the falsifiers that fail are exactly `expected`. Returns every verdict.
 */
export const control = Effect.fn("control")(function* control(
  name: string,
  change: (dir: string) => Effect.Effect<void, MutationError, MutationServices>,
  expected: readonly string[]
) {
  const verdicts = yield* mutate(name, change);

  assert.deepStrictEqual(failedIds(verdicts), expected);

  return verdicts;
});

/** The number a verdict measured under `name` (`sc1.l1 match score`, an offset in frames); throws when it is absent. */
export const reportedScore = (verdict: Verdict, name: string): number =>
  Number(
    Option.getOrThrow(
      Arr.findFirst(verdict.measured, ([key]) => key === name)
    )[1]
  );

/** `name: value` for every measured value of a verdict. */
export const measuredOf = (verdict: Verdict): readonly string[] =>
  Arr.map(verdict.measured, ([name, value]) => `${name}: ${value}`);

/** A mutation that re-encodes the audio of the mp4 through the ffmpeg filter `filter` and copies everything else. */
export const audioFilter = (filter: string) => (dir: string) =>
  rewriteMp4(
    dir,
    [],
    [
      ...mapping("0:s", "0"),
      "-c:v",
      "copy",
      "-c:s",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-af",
      filter,
    ]
  );

/** One input of a rebuilt audio track: a file, the millisecond it starts at and its gain. */
export interface Part {
  readonly file: string;
  readonly gain?: number;
  readonly startMs: number;
}

/** The millisecond at which a frame of the fixture starts (30 fps, rounded as the mix rounds). */
export const frameMs = (frame: number): number =>
  Math.round((frame * 1000) / 30);

/**
 * A mutation that replaces the audio of the mp4 by the mix of `parts`, built as the video package builds its own
 * mix (48 kHz stereo, no normalisation, padded to the length of the video), and copies everything else.
 */
export const remix = (parts: readonly Part[]) => (dir: string) =>
  Effect.gen(function* rebuildAudio() {
    const fixture = yield* Fixture;

    const seconds = (
      fixture.plan.timeline.totalFrames / fixture.plan.settings.fps
    ).toFixed(6);

    const delayed = Arr.map(
      parts,
      (part, index) =>
        `[${index + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${part.gain ?? 1},adelay=${part.startMs}:all=1[a${index}]`
    );

    const labels = Arr.join(
      Arr.map(parts, (_, index) => `[a${index}]`),
      ""
    );

    const graph = Arr.join(
      [
        ...delayed,
        `${labels}amix=inputs=${parts.length}:normalize=0:duration=longest:dropout_transition=0,apad=whole_dur=${seconds},atrim=end=${seconds}[aout]`,
      ],
      ";"
    );

    yield* rewriteMp4(
      dir,
      Arr.map(parts, (part) => part.file),
      [
        "-filter_complex",
        graph,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-map",
        "0:s",
        "-map_chapters",
        "0",
        "-map_metadata",
        "0",
        "-c:v",
        "copy",
        "-c:s",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
      ]
    );
  });

/** The narration FLAC of a Line and the catalogue sound of a name, as inputs of a rebuilt track. */
export const narrationFile = (fixture: FixtureData, lineId: string): string =>
  `${fixture.cacheDir}/${
    Option.getOrThrow(
      Arr.findFirst(
        timedLines(fixture.plan.timeline),
        (line) => line.lineId === lineId
      )
    ).audio.file
  }`;

/** The catalogue sound `name` as a WAV beside the intact build: the build keeps only the sounds its Cues play. */
export const soundFile = (fixture: FixtureData, name: string): string =>
  `${fixture.root}/sounds/${name}.wav`;

/** The whoosh of the fixture story, anchored to the scene change into sc2. */
export const whooshId = "sc2.l1.c1";

/** The measured names of the whoosh: its offset from the planned frame, and from the scene change into sc2. */
export const whooshPlanned = `${whooshId} sfx offset (frames)`;

export const whooshMotion = `${whooshId} sfx onset vs the scene change into sc2 (frames)`;

/**
 * A copy of the build whose whoosh sounds three frames after its planned frame, the picture unchanged: F1 alone fails,
 * naming the whoosh, three frames from its planned frame and from the motion. Returns every verdict.
 */
export const assertWhooshThreeFramesLate = Effect.fn(
  "assertWhooshThreeFramesLate"
)(function* late(name: string) {
  const fixture = yield* Fixture;
  const [, scene] = fixture.plan.timeline.scenes;

  const verdicts = yield* control(
    name,
    (dir) =>
      muxFrames(
        dir,
        Stream.fromIterable(fixture.frames),
        moveFire(fixture.plan, whooshId, (scene?.slideFrame ?? 0) + 3)
      ),
    ["F1"]
  );

  const verdict = verdictOf(verdicts, "F1");

  assert.include(verdict.detail, `${whooshId} sfx: whoosh`);
  assert.approximately(reportedScore(verdict, whooshPlanned), 3, 1);
  assert.approximately(reportedScore(verdict, whooshMotion), 3, 1);

  return verdicts;
});

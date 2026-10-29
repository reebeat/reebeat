// The build program over the stand-ins and fakes: what a finished build holds, what it asks the Encoder to mix, and
// F12, "failure is loud": a speech-cache miss, a failing capture or a refused output directory leaves neither `<out>`
// nor `<out>.partial` for `check` to accept. The adapters' own behaviour is the contract suites' job.
import { assert, describe, it } from "@effect/vitest";
import { decodePlan, frameToMs, requireTimeline } from "@reebeat/core";
import { CaptureError } from "@reebeat/services";
import {
  Array as Arr,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Predicate,
  Ref,
  Stream,
} from "effect";

import { buildProgram } from "../src/buildProgram.ts";
import { decodeBuildManifest } from "../src/manifest.ts";
import {
  fakeCapturer,
  fakeRenderer,
  parts,
  platform,
  storyText,
  tinyFrames,
  worldOf,
} from "./buildSupport.ts";
import type { Muxed, Parts } from "./buildSupport.ts";

/** A story file in a temporary directory; `out` is where the build goes. */
const setup = Effect.gen(function* setup() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-build-" });
  const story = path.join(dir, "story.fountain");

  yield* fs.writeFileString(story, storyText);

  return { dir, out: path.join(dir, "out"), story };
});

/** The build options for a story; `refreshSpeech` defaults to true, as the stand-ins need no model. */
const optionsFor = (
  where: { readonly out: string; readonly story: string },
  refreshSpeech = true
) => ({ name: "build", out: where.out, refreshSpeech, story: where.story });

/** `chosen` parts (default: the stand-ins) built once; `run` builds a story on them, `seen` records every mux. */
const withWorld = Effect.fnUntraced(function* withWorld(
  choose: (seen: Ref.Ref<readonly Muxed[]>) => Parts = parts
) {
  const seen = yield* Ref.make<readonly Muxed[]>([]);
  const context = yield* Layer.build(worldOf(choose(seen)));
  const where = yield* setup;

  return {
    run: (refreshSpeech = true) =>
      Effect.provideContext(
        buildProgram(optionsFor(where, refreshSpeech)),
        context
      ),
    seen,
    where,
  };
});

/** The files (not directories) under `dir`, as paths relative to it, sorted. */
const filesUnder = Effect.fnUntraced(function* filesUnder(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const stats = yield* Effect.forEach(
    yield* fs.readDirectory(dir, { recursive: true }),
    (entry) =>
      Effect.map(fs.stat(path.join(dir, entry)), (info) => ({ entry, info }))
  );

  return Arr.sort(
    Arr.map(
      Arr.filter(stats, ({ info }) => info.type === "File"),
      ({ entry }) => entry
    ),
    Order.String
  );
});

/** Asserts that nothing exists at any of `paths`. */
const absent = (...paths: readonly string[]) =>
  Effect.forEach(
    paths,
    (target) =>
      Effect.map(
        Effect.flatMap(FileSystem.FileSystem, (fs) => fs.exists(target)),
        (found) => {
          assert.isFalse(found, `${target} must not exist`);
        }
      ),
    { discard: true }
  );

/** The scheduled Plan a build wrote. */
const writtenPlan = Effect.fnUntraced(function* writtenPlan(out: string) {
  const fs = yield* FileSystem.FileSystem;
  const plan = yield* decodePlan(yield* fs.readFileString(`${out}/plan.json`));

  return yield* Effect.fromResult(requireTimeline(plan));
});

describe("buildProgram: a finished build", () => {
  it.effect(
    "writes the plan, the deck, the sounds, the subtitles and the video, and build.json",
    () =>
      Effect.gen(function* finished() {
        const fs = yield* FileSystem.FileSystem;
        const { run, where } = yield* withWorld();
        const summary = yield* run();
        const files = yield* filesUnder(where.out);
        const plan = yield* writtenPlan(where.out);

        assert.deepStrictEqual(files, [
          "assets/deck.bin",
          "assets/sfx/pop.wav",
          "build.json",
          "build.mp4",
          "build.vtt",
          "deck.html",
          "plan.json",
        ]);
        yield* absent(`${where.out}.partial`);
        assert.strictEqual(summary.frames, plan.timeline.totalFrames);
        assert.strictEqual(summary.files, files.length - 1);
        assert.strictEqual(summary.mp4Bytes, 3);

        const wav = yield* fs.readFile(`${where.out}/assets/sfx/pop.wav`);

        assert.strictEqual(
          new TextDecoder().decode(wav.subarray(0, 4)),
          "RIFF"
        );
        assert.isTrue(
          (yield* fs.readFileString(`${where.out}/build.vtt`)).startsWith(
            "WEBVTT"
          )
        );
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "asks the Encoder for the Timeline: its frames, narration at each Line's start, the sound at its Cue's fire frame, the chapters and the source hash",
    () =>
      Effect.gen(function* request() {
        const { run, seen, where } = yield* withWorld();

        yield* run();

        const [muxed] = yield* Ref.get(seen);
        const timed = yield* writtenPlan(where.out);
        const { fps, height, width } = timed.settings;

        const lines = Arr.flatMap(
          timed.timeline.scenes,
          (scene) => scene.lines
        );

        const tracks = muxed?.request.tracks ?? [];
        const second = timed.timeline.chapters[1]?.startFrame ?? -1;

        const sfx = Arr.findFirst(
          Arr.flatMap(lines, (line) => line.cues),
          (cue) => cue.cueId === "sc1.l1.c2"
        );

        assert.strictEqual(muxed?.frames, timed.timeline.totalFrames);
        assert.strictEqual(muxed?.request.fps, fps);
        assert.strictEqual(muxed?.request.width, width);
        assert.strictEqual(muxed?.request.height, height);

        // One narration clip per Line in order, then the one sfx at its Cue's fire frame.
        assert.deepStrictEqual(
          Arr.map(tracks, (track) => track.startMs),
          [
            ...Arr.map(lines, (line) => frameToMs(line.startFrame, fps)),
            frameToMs(Option.getOrThrow(sfx).fireFrame, fps),
          ]
        );

        // The narration is the silent stand-in's silence, the sound is the tone's: only the last track is audible.
        assert.deepStrictEqual(
          Arr.map(tracks, (track) =>
            Arr.some(
              Arr.fromIterable(track.clip.samples),
              (sample) => sample !== 0
            )
          ),
          [false, false, true]
        );

        assert.deepStrictEqual(muxed?.request.chapters, [
          { endMs: frameToMs(second, fps), startMs: 0, title: "One" },
          {
            endMs: frameToMs(timed.timeline.totalFrames, fps),
            startMs: frameToMs(second, fps),
            title: "Two",
          },
        ]);
        assert.strictEqual(
          muxed?.request.totalMs,
          (1000 * timed.timeline.totalFrames) / fps
        );
        assert.strictEqual(muxed?.request.metadata.title, "Build");
        assert.strictEqual(
          muxed?.request.metadata.comment,
          `reebeat source-sha256 ${timed.sourceSha256}`
        );
        assert.isTrue((muxed?.request.vtt ?? "").includes(timed.sourceSha256));
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "writes build.json v2: every file, the seven adapters with their egress, the provenance of every asset used",
    () =>
      Effect.gen(function* manifest() {
        const fs = yield* FileSystem.FileSystem;
        const { run, where } = yield* withWorld();

        yield* run();

        const written = yield* decodeBuildManifest(
          yield* fs.readFileString(`${where.out}/build.json`)
        );

        const timed = yield* writtenPlan(where.out);

        const keys = Arr.map(
          Arr.flatMap(timed.timeline.scenes, (scene) => scene.lines),
          (line) => line.audio.file.slice(0, -".flac".length)
        );

        assert.strictEqual(written.schema, 2);
        assert.deepStrictEqual(
          Arr.map(written.adapters, (adapter) => adapter.service),
          [
            "SpeechSynthesizer",
            "WordAligner",
            "SoundLibrary",
            "Renderer",
            "FrameCapturer",
            "Encoder",
            "AssetCache",
          ]
        );

        for (const adapter of written.adapters) {
          assert.deepStrictEqual(adapter.egress, { kind: "local", sends: [] });
        }

        assert.strictEqual(written.assets.length, 2);
        assert.deepStrictEqual(
          Arr.map(written.assets, (asset) => asset.keyParts.key),
          Arr.sort(Arr.dedupe(keys), Order.String)
        );
        assert.deepStrictEqual(
          Arr.map(written.files, (file) => file.path),
          Arr.filter(
            yield* filesUnder(where.out),
            (file) => file !== "build.json"
          )
        );
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "a second build from the cache alone replaces the first and writes the same build.json",
    () =>
      Effect.gen(function* twice() {
        const fs = yield* FileSystem.FileSystem;
        const { run, where } = yield* withWorld();

        yield* run(true);

        const first = yield* fs.readFileString(`${where.out}/build.json`);

        yield* run(false);
        assert.strictEqual(
          yield* fs.readFileString(`${where.out}/build.json`),
          first
        );
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "lists an integration adapter's egress declaration in the manifest",
    () =>
      Effect.gen(function* egress() {
        const fs = yield* FileSystem.FileSystem;

        const { run, where } = yield* withWorld((seen) => ({
          ...parts(seen),
          renderer: fakeRenderer({
            egress: { kind: "integration", sends: ["the plan"] },
            id: "fake-hosted@1",
            settings: { region: "eu" },
          }),
        }));

        yield* run();

        const written = yield* decodeBuildManifest(
          yield* fs.readFileString(`${where.out}/build.json`)
        );

        assert.deepStrictEqual(
          Option.getOrUndefined(
            Arr.findFirst(
              written.adapters,
              (adapter) => adapter.service === "Renderer"
            )
          ),
          {
            egress: { kind: "integration", sends: ["the plan"] },
            id: "fake-hosted@1",
            service: "Renderer",
            settings: { region: "eu" },
          }
        );
      }).pipe(Effect.scoped, Effect.provide(platform))
  );
});

describe("buildProgram: failure is loud (F12)", () => {
  it.effect(
    "a cache miss without refresh is SpeechCacheMiss and writes nothing",
    () =>
      Effect.gen(function* miss() {
        const { run, where } = yield* withWorld();
        const failure = yield* Effect.flip(run(false));

        assert.isTrue(Predicate.isTagged(failure, "SpeechCacheMiss"));
        yield* absent(where.out, `${where.out}.partial`);
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "an interrupt in the middle of the capture leaves neither <out> nor <out>.partial, and removes an earlier build",
    () =>
      Effect.gen(function* interrupted() {
        const fs = yield* FileSystem.FileSystem;
        const capturing = yield* Deferred.make<boolean>();

        // Three frames, then a capture that never ends: the build is in the middle of the mux when it is interrupted.
        const hanging = fakeCapturer(() =>
          Stream.concat(
            tinyFrames(3),
            Stream.fromEffect(
              Effect.andThen(Deferred.succeed(capturing, true), Effect.never)
            )
          )
        );

        const good = yield* withWorld();

        yield* good.run();

        const stuck = yield* withWorld((seen) => ({
          ...parts(seen),
          capturer: hanging,
        }));

        yield* fs.copy(good.where.out, stuck.where.out);

        const fiber = yield* Effect.forkChild(stuck.run());

        yield* Deferred.await(capturing);
        assert.isTrue(
          yield* fs.exists(`${stuck.where.out}.partial`),
          "the build is under way: its partial directory exists"
        );

        yield* Fiber.interrupt(fiber);

        assert.isTrue(Exit.hasInterrupts(yield* Fiber.await(fiber)));
        yield* absent(stuck.where.out, `${stuck.where.out}.partial`);
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "a failing capture is its typed error, writes no output and removes an earlier build",
    () =>
      Effect.gen(function* capture() {
        const fs = yield* FileSystem.FileSystem;

        const failing = fakeCapturer(() =>
          Stream.concat(
            tinyFrames(3),
            Stream.fail(
              new CaptureError({
                adapter: "fake-capturer@1-standin",
                cause: "timeout",
                message: "the capture timed out",
              })
            )
          )
        );

        const good = yield* withWorld();

        yield* good.run();
        assert.isTrue(yield* fs.exists(`${good.where.out}/build.json`));

        const bad = yield* withWorld((seen) => ({
          ...parts(seen),
          capturer: failing,
        }));

        yield* fs.copy(good.where.out, bad.where.out);

        const failure = yield* Effect.flip(bad.run());

        assert.isTrue(Predicate.isTagged(failure, "CaptureError"));
        yield* absent(bad.where.out, `${bad.where.out}.partial`);
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "refuses an output directory that is neither empty nor an earlier build, and leaves it alone",
    () =>
      Effect.gen(function* occupied() {
        const fs = yield* FileSystem.FileSystem;
        const { run, where } = yield* withWorld();

        yield* fs.makeDirectory(where.out, { recursive: true });
        yield* fs.writeFileString(`${where.out}/notes.txt`, "mine");

        const failure = yield* Effect.flip(run());

        assert.isTrue(Predicate.isTagged(failure, "OutputDirOccupied"));
        assert.strictEqual(
          yield* fs.readFileString(`${where.out}/notes.txt`),
          "mine"
        );
        yield* absent(`${where.out}.partial`);
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "a secret-looking setting of any selected adapter stops the build before anything is kept",
    () =>
      Effect.gen(function* secret() {
        const { run, where } = yield* withWorld((seen) => ({
          ...parts(seen),
          renderer: fakeRenderer({
            egress: { kind: "local", sends: [] },
            id: "fake-renderer@1",
            settings: { apiToken: "x" },
          }),
        }));

        const failure = yield* Effect.flip(run());

        assert.isTrue(Predicate.isTagged(failure, "SecretLikeSetting"));
        yield* absent(where.out, `${where.out}.partial`);
      }).pipe(Effect.scoped, Effect.provide(platform))
  );

  it.effect(
    "a name that is not a plain file stem is InvalidOutputName before anything is written, anywhere",
    () =>
      Effect.gen(function* hostile() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        // Two levels below a root the test owns: `<out>.partial/../../escaped` would land inside the root.
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "reebeat-build-",
        });

        const dir = path.join(root, "a", "b");
        const story = path.join(dir, "story.fountain");

        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(story, storyText);

        const context = yield* Layer.build(
          worldOf(parts(yield* Ref.make<readonly Muxed[]>([])))
        );

        const before = yield* fs.readDirectory(root, { recursive: true });

        for (const name of [
          "../../escaped",
          "..",
          "x/y",
          "a b",
          ".hidden",
          "",
          "/etc/passwd",
        ]) {
          const failure = yield* Effect.flip(
            Effect.provideContext(
              buildProgram({
                name,
                out: path.join(dir, "out"),
                refreshSpeech: true,
                story,
              }),
              context
            )
          );

          assert.isTrue(Predicate.isTagged(failure, "InvalidOutputName"), name);
        }

        assert.deepStrictEqual(
          Arr.sort(
            yield* fs.readDirectory(root, { recursive: true }),
            Order.String
          ),
          Arr.sort(before, Order.String)
        );
      }).pipe(Effect.scoped, Effect.provide(platform))
  );
});

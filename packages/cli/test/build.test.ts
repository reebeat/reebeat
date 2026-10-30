// `tsukuri build` on a real file system, the real reveal.js Renderer and a real ffmpeg, with the offline stand-ins
// for narration and a fake capturer (no Chromium starts): what a finished build holds, the adapters it lists, and
// F12, "failure is loud": a speech-cache miss and a capture failure each stop the build with their typed error and
// leave neither `<out>` nor `<out>.partial` for `check` to accept.
import { assert, layer } from "@effect/vitest";
import { decodePlan } from "@tsukuri/core";
import { MediaTools, probeMedia } from "@tsukuri/encode-ffmpeg";
import { sha256Hex } from "@tsukuri/pipeline";
import { CaptureError } from "@tsukuri/services";
import {
  Array as Arr,
  Effect,
  Exit,
  FileSystem,
  Order,
  Path,
  Stream,
  String as Str,
} from "effect";

import { readManifest } from "../src/manifest.ts";
import {
  fakeCapturerWith,
  platform,
  runBuild,
  runCli,
  storySetup,
  storyText,
  tempDirectory,
  writeText,
} from "./support.ts";
import type { Fakes } from "./support.ts";

/** The flags of the offline stand-ins for narration. */
const offline = ["--speech", "silent", "--aligner", "even"] as const;

const setup = storySetup;

/** Every file under `dir`, as a path relative to it, sorted. */
const filesUnder = Effect.fnUntraced(function* filesUnder(dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fs.readDirectory(dir, { recursive: true });

  const files = yield* Effect.filter(entries, (entry) =>
    Effect.map(fs.stat(path.join(dir, entry)), (info) => info.type === "File")
  );

  return Arr.sort(files, Order.String);
});

/** Asserts that nothing exists at any of `paths`. */
const absent = Effect.fnUntraced(function* absent(...paths: string[]) {
  const fs = yield* FileSystem.FileSystem;

  for (const target of paths) {
    assert.isFalse(yield* fs.exists(target), `${target} must not exist`);
  }
});

layer(platform)("tsukuri build", (it) => {
  it.effect(
    "writes the files of a finished build, listed in build.json with the adapters and their egress, and no partial directory",
    () =>
      Effect.gen(function* finished() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const where = yield* setup;
        const { out, story } = where;

        const { exit, stdout } = yield* runBuild(where, [
          ...offline,
          "--name",
          "cli",
        ]);

        assert.isTrue(Exit.isSuccess(exit));

        const files = yield* filesUnder(out);

        for (const expected of [
          "assets/deck.js",
          "assets/reveal/reveal.js",
          "assets/sfx/pop.wav",
          "build.json",
          "cli.mp4",
          "cli.vtt",
          "deck.html",
          "plan.json",
        ]) {
          assert.include(files, expected);
        }

        // Only the sounds the Plan uses, and no narration audio: the cache is not part of the build.
        assert.deepStrictEqual(
          Arr.filter(files, (file) => Str.startsWith("assets/sfx/")(file)),
          ["assets/sfx/pop.wav"]
        );
        assert.deepStrictEqual(
          Arr.filter(files, (file) => Str.endsWith(".flac")(file)),
          []
        );
        yield* absent(`${out}.partial`, path.join(out, ".mux-"));

        // build.json lists every file but itself, with the hash and size of its bytes, and the hash of the source.
        const manifest = yield* readManifest(out);

        assert.deepStrictEqual(
          Arr.map(manifest.files, (file) => file.path),
          Arr.filter(files, (file) => file !== "build.json")
        );

        for (const entry of manifest.files) {
          const bytes = yield* fs.readFile(path.join(out, entry.path));

          assert.strictEqual(entry.bytes, bytes.byteLength);
          assert.strictEqual(entry.sha256, yield* sha256Hex(bytes));
        }

        assert.strictEqual(manifest.sourcePath, "story.fountain");
        assert.strictEqual(
          manifest.sourceSha256,
          yield* sha256Hex(yield* fs.readFile(story))
        );

        // The seven adapters, each local: nothing leaves the machine; and the provenance of both Lines' audio.
        assert.deepStrictEqual(
          Arr.map(manifest.adapters, (adapter) => adapter.id).slice(0, 2),
          ["silent@2-standin", "even@1-standin"]
        );
        assert.strictEqual(manifest.adapters.length, 7);

        for (const adapter of manifest.adapters) {
          assert.deepStrictEqual(adapter.egress, { kind: "local", sends: [] });
        }

        assert.strictEqual(manifest.assets.length, 2);

        // plan.json is the Plan with its Timeline; the video has exactly the Timeline's frames.
        const plan = yield* decodePlan(
          yield* fs.readFileString(path.join(out, "plan.json"))
        );

        const frames = plan.timeline?.totalFrames ?? -1;
        const media = yield* probeMedia(path.join(out, "cli.mp4"));

        assert.strictEqual(plan.sourceSha256, manifest.sourceSha256);
        assert.isAbove(frames, 0);
        assert.include(
          Arr.map(media.streams, (stream) => stream.nb_frames),
          frames
        );
        assert.include(stdout, `${frames} frames`);

        // The summary names every adapter and what it sends out: nothing, for each local one.
        assert.include(
          stdout,
          "SpeechSynthesizer: silent@2-standin, egress: none"
        );

        assert.strictEqual(
          Arr.length(
            Arr.filter(Str.split(stdout, "\n"), (row) =>
              Str.endsWith("egress: none")(row)
            )
          ),
          7
        );
      }).pipe(Effect.provide(MediaTools.layer))
  );

  it.effect(
    "names the files after the story's directory when --name is absent",
    () =>
      Effect.gen(function* named() {
        const path = yield* Path.Path;
        const where = yield* setup;

        const { exit } = yield* runBuild(where, [...offline]);

        assert.isTrue(Exit.isSuccess(exit));
        assert.include(
          yield* filesUnder(where.out),
          `${path.basename(where.dir)}.mp4`
        );
      })
  );

  it.effect(
    "the speech cache is the story's speech-cache directory, or --cache-dir",
    () =>
      Effect.gen(function* caches() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const beside = yield* setup;
        const elsewhere = yield* setup;
        const named = path.join(yield* tempDirectory, "cache");

        yield* runBuild(beside, [...offline]);
        yield* runBuild(elsewhere, [...offline, "--cache-dir", named]);

        assert.isAbove(
          Arr.filter(
            yield* fs.readDirectory(path.join(beside.dir, "speech-cache")),
            (name) => Str.endsWith(".flac")(name)
          ).length,
          0
        );
        assert.isAbove(
          Arr.filter(yield* fs.readDirectory(named), (name) =>
            Str.endsWith(".flac")(name)
          ).length,
          0
        );
        yield* absent(path.join(elsewhere.dir, "speech-cache"));
      })
  );

  it.effect(
    "a story's tsukuri.config.json selects the adapters, and a flag beats it",
    () =>
      Effect.gen(function* configured() {
        const where = yield* setup;

        yield* writeText(
          where.dir,
          "tsukuri.config.json",
          '{ "speech": "silent", "aligner": "even" }'
        );

        const fromFile = yield* runBuild(where);

        assert.isTrue(Exit.isSuccess(fromFile.exit));
        assert.include(fromFile.stdout, "SpeechSynthesizer: silent@2-standin");

        // The flag says kokoro: with no cache and no refresh that is a miss, not the config's silent narrator.
        const overridden = yield* runBuild(where, ["--speech", "kokoro"]);

        assert.isTrue(Exit.isFailure(overridden.exit));
        assert.match(overridden.stderr, /^SpeechCacheMiss: /u);
      })
  );

  it.effect(
    "F12: a cache miss stops the build with SpeechCacheMiss naming the Line and the key, and leaves no output",
    () =>
      Effect.gen(function* miss() {
        const where = yield* setup;

        const { exit, stderr, stdout } = yield* runBuild(where, [
          "--aligner",
          "even",
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^SpeechCacheMiss: .*Line sc1\.l1/u);
        assert.match(stderr, /[0-9a-f]{64}/u);
        assert.strictEqual(stdout, "");
        yield* absent(where.out, `${where.out}.partial`);
      })
  );

  it.effect(
    "F12: a capture that fails stops the build with its typed error, leaves no output and replaces an earlier build with nothing",
    () =>
      Effect.gen(function* failing() {
        const fs = yield* FileSystem.FileSystem;
        const where = yield* setup;

        const earlier = yield* runBuild(where, [...offline]);

        assert.isTrue(Exit.isSuccess(earlier.exit));
        assert.isTrue(yield* fs.exists(`${where.out}/build.json`));

        const { exit, stderr } = yield* runBuild(where, [...offline], {
          capturer: fakeCapturerWith(() =>
            Stream.fail(
              new CaptureError({
                adapter: "fake-capturer@1",
                cause: "timeout",
                message: "the capture timed out",
              })
            )
          ),
        });

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^CaptureError: the capture timed out/u);
        yield* absent(where.out, `${where.out}.partial`);
      })
  );

  it.effect(
    "--capture-timeout reaches the capturer; without it the capturer's default applies",
    () =>
      Effect.gen(function* timeout() {
        const seen: (number | undefined)[] = [];

        const spy: NonNullable<Fakes["spy"]> = (_selection, options) => {
          seen.push(options.captureTimeoutSeconds);
        };

        yield* runBuild(
          yield* setup,
          [...offline, "--capture-timeout", "0.5"],
          {
            spy,
          }
        );
        yield* runBuild(yield* setup, [...offline], { spy });

        assert.deepStrictEqual(seen, [0.5, undefined]);
      })
  );

  it.effect(
    "refuses an output directory that is neither empty nor an earlier build, naming it, and leaves it alone",
    () =>
      Effect.gen(function* occupied() {
        const fs = yield* FileSystem.FileSystem;
        const where = yield* setup;

        yield* fs.makeDirectory(where.out, { recursive: true });
        yield* writeText(where.out, "notes.txt", "mine");

        const { exit, stderr } = yield* runBuild(where, [...offline]);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^OutputDirOccupied: /u);
        assert.strictEqual(
          yield* fs.readFileString(`${where.out}/notes.txt`),
          "mine"
        );
        yield* absent(`${where.out}.partial`);
      })
  );

  it.effect(
    "a story that does not exist is SourceUnreadable and builds nothing",
    () =>
      Effect.gen(function* nothing() {
        const dir = yield* tempDirectory;
        const out = `${dir}/out`;

        const { exit, stderr } = yield* runCli([
          "build",
          `${dir}/nothing.fountain`,
          "--out",
          out,
          ...offline,
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^SourceUnreadable: cannot read /u);
        yield* absent(out, `${out}.partial`);
      })
  );

  it.effect(
    "--name that is not a plain file stem is InvalidOutputName and nothing is created, inside or outside the output",
    () =>
      Effect.gen(function* hostile() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        // Two levels below a root the test owns: `<out>.partial/../../escaped` would land inside the root.
        const root = yield* tempDirectory;
        const dir = path.join(root, "a", "b");

        yield* fs.makeDirectory(dir, { recursive: true });

        const story = yield* writeText(dir, "story.fountain", storyText);
        const before = yield* fs.readDirectory(root, { recursive: true });

        for (const name of ["../../escaped", "..", "x/y", "a b", ".hidden"]) {
          const { exit, stderr, stdout } = yield* runCli([
            "build",
            story,
            "--out",
            path.join(dir, "out"),
            ...offline,
            "--name",
            name,
          ]);

          assert.isTrue(Exit.isFailure(exit), name);
          assert.match(stderr, /^InvalidOutputName: /u, name);
          assert.strictEqual(stdout, "", name);
        }

        assert.sameMembers(
          yield* fs.readDirectory(root, { recursive: true }),
          before
        );
      })
  );
});

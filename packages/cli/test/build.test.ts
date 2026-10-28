// `reebeat build` on a real file system and a real ffmpeg, with a fake browser (no Chromium starts): what a
// finished build holds, and F12, "failure is loud": a speech-cache miss, a capture timeout and a browser failure each
// stop the build with their typed error and leave neither `<out>` nor `<out>.partial` for `check` to accept.
import { assert, describe, it as realClock, layer } from "@effect/vitest";
import { decodePlan } from "@reebeat/core";
import { sha256Hex } from "@reebeat/speech";
import { BrowserFailed, MediaTools, probeMedia } from "@reebeat/video";
import {
  Array as Arr,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Option,
  Order,
  Path,
} from "effect";

import { readManifest } from "../src/manifest.ts";
import {
  fakeBrowser,
  hangingBrowser,
  keysOf,
  planOf,
  platform,
  runBuild,
  runCli,
  sameId,
  storyWithCache,
  tempDirectory,
  writeText,
} from "./support.ts";

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

  for (const path of paths) {
    assert.isFalse(yield* fs.exists(path), `${path} must not exist`);
  }
});

layer(platform)("reebeat build", (it) => {
  it.effect(
    "writes the files of a finished build, listed in build.json, and no partial directory",
    () =>
      Effect.gen(function* finished() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const setup = yield* storyWithCache;
        const { out, story } = setup;

        const { exit, stdout } = yield* runBuild(setup, ["--name", "cli"]);

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
          Arr.filter(files, (file) => file.startsWith("assets/sfx/")),
          ["assets/sfx/pop.wav"]
        );
        assert.deepStrictEqual(
          Arr.filter(files, (file) => file.endsWith(".flac")),
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
      }).pipe(Effect.provide(MediaTools.layer))
  );

  it.effect(
    "names the files after the story's directory when --name is absent",
    () =>
      Effect.gen(function* named() {
        const path = yield* Path.Path;
        const setup = yield* storyWithCache;

        assert.isTrue(Exit.isSuccess((yield* runBuild(setup)).exit));
        assert.include(
          yield* filesUnder(setup.out),
          `${path.basename(setup.dir)}.mp4`
        );
      })
  );

  it.effect(
    "replaces an earlier build, and removes a stale partial directory",
    () =>
      Effect.gen(function* replaced() {
        const fs = yield* FileSystem.FileSystem;
        const setup = yield* storyWithCache;
        const { out } = setup;

        yield* fs.makeDirectory(`${out}.partial`);
        yield* writeText(`${out}.partial`, "left-by-a-crash.txt", "x");

        assert.isTrue(Exit.isSuccess((yield* runBuild(setup)).exit));
        yield* writeText(out, "stray.txt", "not in the manifest");
        assert.isTrue(Exit.isSuccess((yield* runBuild(setup)).exit));

        assert.notInclude(yield* filesUnder(out), "stray.txt");
        yield* absent(`${out}.partial`);
      })
  );

  it.effect(
    "refuses to replace a directory that is not an earlier build, and leaves it alone",
    () =>
      Effect.gen(function* occupied() {
        const fs = yield* FileSystem.FileSystem;
        const setup = yield* storyWithCache;
        const { out } = setup;

        yield* fs.makeDirectory(out);
        yield* writeText(out, "mine.txt", "mine");

        const { exit, stderr } = yield* runBuild(setup);

        assert.isTrue(Exit.isFailure(exit));
        assert.match(stderr, /^OutputDirOccupied: /u);
        assert.deepStrictEqual(yield* filesUnder(out), ["mine.txt"]);
      })
  );
});

layer(platform)("reebeat build fails loudly (F12)", (it) => {
  it.effect(
    "a cache entry deleted from a copy of the committed cache: SpeechCacheMiss names the Line, and no output is left",
    () =>
      Effect.gen(function* miss() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const committed = yield* sameId;
        const scratch = yield* tempDirectory;
        const cache = path.join(scratch, "speech-cache");

        const setup = {
          out: path.join(scratch, "out"),
          story: committed.story,
        };

        yield* fs.copy(committed.cache, cache);

        // Control: the unmodified copy reads, for every Line (`plan --timing` reads the cache and writes nothing).
        const intact = yield* runCli([
          "plan",
          setup.story,
          "--timing",
          "--cache",
          cache,
        ]);

        assert.isTrue(Exit.isSuccess(intact.exit));

        // Mutation: delete the entry of one Line.
        const keys = yield* keysOf(
          yield* planOf(yield* fs.readFileString(setup.story))
        );

        const victim = Option.getOrThrow(
          Arr.findFirst(keys, (entry) => entry.lineId === "sc4.l2")
        );

        yield* fs.remove(path.join(cache, `${victim.key}.json`));
        yield* fs.remove(path.join(cache, `${victim.key}.flac`));

        const { exit, stderr, stdout } = yield* runBuild(setup, [
          "--cache",
          cache,
        ]);

        assert.isTrue(Exit.isFailure(exit));
        assert.strictEqual(stdout, "");
        assert.match(stderr, /^SpeechCacheMiss: /u);
        assert.include(stderr, "Line sc4.l2");
        assert.include(stderr, victim.key);
        yield* absent(setup.out, `${setup.out}.partial`);
      })
  );

  it.effect(
    "a browser that fails: its typed error surfaces unchanged, and no output is left",
    () =>
      Effect.gen(function* browser() {
        const setup = yield* storyWithCache;

        const { exit, stderr } = yield* runBuild(setup, [], {
          browser: fakeBrowser(
            Effect.fail(
              new BrowserFailed({
                cause: undefined,
                message: "screenshot failed: the page crashed",
                operation: "screenshot",
              })
            )
          ),
        });

        assert.isTrue(Exit.isFailure(exit));
        assert.match(
          stderr,
          /^BrowserFailed: screenshot failed: the page crashed/u
        );
        yield* absent(setup.out, `${setup.out}.partial`);
      })
  );
});

// The deadline and the interrupt need the real clock, which a `layer` block does not offer.
describe("reebeat build fails loudly on the real clock (F12)", () => {
  realClock.live(
    "a capture past its deadline: CaptureTimeout, and no output is left",
    () =>
      Effect.gen(function* timeout() {
        const setup = yield* storyWithCache;

        const { exit, stderr } = yield* runBuild(
          setup,
          ["--capture-timeout", "0.5"],
          {
            browser: hangingBrowser,
          }
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.match(
          stderr,
          /^CaptureTimeout: capturing \d+ frames took longer than 0\.5 s/u
        );
        yield* absent(setup.out, `${setup.out}.partial`);
      }).pipe(Effect.provide(platform))
  );

  realClock.live(
    "an interrupt while the capture runs removes the partial directory",
    () =>
      Effect.gen(function* interrupted() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const setup = yield* storyWithCache;
        const deck = path.join(`${setup.out}.partial`, "deck.html");

        const running = yield* Effect.forkChild(
          runBuild(setup, [], { browser: hangingBrowser })
        );

        // The deck is written just before the capture starts: the build is inside its scope.
        yield* Effect.repeat(fs.exists(deck), { until: (written) => written });
        yield* Fiber.interrupt(running);

        yield* absent(setup.out, `${setup.out}.partial`);
      }).pipe(Effect.provide(platform))
  );
});

// F5, the build's video is data an attacker can write (spec 0018, Revision 14): a `build.json` lists `<name>.mp4`, and that
// file can be anything a person or an agent put in the build directory. The attack the reviewer ran: the "video" is a
// text file `ffconcat version 1.0 / file ln/canary.mp4`, where `ln` is a symbolic link to a directory outside the
// root. Without a forced input format and a file-only protocol whitelist, ffprobe follows the concat script and reports
// the outside file's streams; without a refusal of symbolic links in the build tree, the link is followed too. Both
// defences are tested alone and together, with the real ffmpeg and a canary video of a size no fixture has.
import { assert, describe, it } from "@effect/vitest";
import { MediaTools } from "@tsukuri/encode-ffmpeg";
import { Observer, artifactObserve } from "@tsukuri/lifecycle";
import type { BuildFiles } from "@tsukuri/lifecycle";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  String as Str,
} from "effect";

import { ffmpegObserver } from "../src/observerFfmpeg.ts";
import {
  FixtureService,
  buildFilesIn,
  callTool,
  connectOver,
  fixtureLayer,
  platform,
  textBlocks,
} from "./support.ts";

/** The height of the canary video: the fixture's own build is 180 pixels high. */
const canaryHeight = 90;

const concatScript = "ffconcat version 1.0\nfile ln/canary.mp4\n";

/** An `outside` directory with a canary video, and a directory next to it with a link `ln` to it. */
const attack = Effect.gen(function* attackSetup() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* MediaTools;
  const fixture = yield* FixtureService;

  const base = yield* fs.makeTempDirectoryScoped({
    prefix: "tsukuri-ffattack-",
  });

  const outside = path.join(base, "outside");
  const root = path.join(base, "stories");
  const builds = path.join(base, "build");
  const dir = path.join(builds, "attack");

  yield* fs.makeDirectory(outside, { recursive: true });
  yield* tools.run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=160x${canaryHeight}:rate=30:duration=1`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=880:sample_rate=16000:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    path.join(outside, "canary.mp4"),
  ]);

  yield* fs.makeDirectory(path.join(root, "attack"), { recursive: true });
  yield* fs.copyFile(
    path.join(fixture.workspace.root, "harbour", "story.fountain"),
    path.join(root, "attack", "story.fountain")
  );
  yield* fs.makeDirectory(dir, { recursive: true });

  // The build of the fixture, with its video replaced by the concat script and a link to the outside directory.
  for (const name of ["build.json", "deck.html", "plan.json", "harbour.vtt"]) {
    yield* fs.copyFile(
      path.join(fixture.harbourBuildDir, name),
      path.join(dir, name)
    );
  }

  yield* fs.writeFileString(path.join(dir, "harbour.mp4"), concatScript);
  yield* fs.symlink(outside, path.join(dir, "ln"));

  const files: BuildFiles = yield* buildFilesIn(dir);

  return { files, workspace: { builds, root } };
}).pipe(Effect.provide(Layer.provideMerge(MediaTools.layer, platform)));

const observerLayer = Layer.provide(
  ffmpegObserver,
  Layer.provide(MediaTools.layer, platform)
);

describe("a disguised video cannot read outside the root", () => {
  it.layer(fixtureLayer)("with the real ffmpeg", (suite) => {
    suite.effect(
      "the Observer alone refuses a concat script that reaches a linked directory",
      () =>
        Effect.scoped(
          Effect.gen(function* observer() {
            const { files } = yield* attack;

            const run = Effect.provide(
              Effect.gen(function* observed() {
                const service = yield* Observer;

                return {
                  audio: yield* Effect.flip(
                    service.audio(files, { fromMs: 0, toMs: 500 })
                  ),
                  frame: yield* Effect.flip(
                    service.frame(files, {
                      frame: 1,
                      frameSeconds: 1 / 30,
                      maxBytes: 65_536,
                      seconds: 1 / 30,
                    })
                  ),
                  media: yield* Effect.flip(service.media(files)),
                };
              }),
              observerLayer
            );

            const failures = yield* run;

            assert.deepStrictEqual(
              [failures.audio._tag, failures.frame._tag, failures.media._tag],
              ["ObserveFailed", "ObserveFailed", "ObserveFailed"]
            );
          })
        )
    );

    suite.effect(
      "through the tools: every kind fails, and nothing of the outside file is in a result",
      () =>
        Effect.scoped(
          Effect.gen(function* tools() {
            const { workspace } = yield* attack;
            const client = yield* connectOver(workspace, "2025-11-25");

            for (const input of [
              { kind: "streams", project: "attack" },
              { kind: "chapters", project: "attack" },
              { at: { frame: 1 }, kind: "frame", project: "attack" },
              { fromMs: 0, kind: "audio", project: "attack", toMs: 500 },
            ] as const) {
              const called = yield* callTool(client, artifactObserve, input);
              const text = Arr.join(textBlocks(called.result), " ");

              assert.isTrue(
                called.result.isError === true,
                `${input.kind} is refused`
              );
              assert.isFalse(
                Str.includes(`"height":${canaryHeight}`)(text),
                `${input.kind} leaks the canary's streams`
              );
              assert.isFalse(
                Arr.some(
                  called.result.content,
                  (block) => block.type === "image"
                ),
                `${input.kind} returns no image`
              );
            }
          })
        )
    );
  });
});

// The mux on a real ffmpeg: the container holds what the Plan says (streams, chapters, subtitles, narration at its
// Lines, the sound at its Cue) and two builds from fresh browser launches decode to the same frames and samples.
import { assert, it } from "@effect/vitest";
import { sfxWav } from "@reebeat/sfx";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  Predicate,
} from "effect";

import { MediaTools } from "../src/mediaTools.ts";
import { muxVideo } from "../src/mux.ts";
import {
  audioOffsetMs,
  decodeMonoPcm,
  frameHashes,
  probeMedia,
} from "../src/probe.ts";
import type { MediaInfo } from "../src/probe.ts";
import { vtt } from "../src/vtt.ts";
import { timedFixture } from "./fixturePlan.ts";
import { buildFixture, framesOf, makeWorkspace, services } from "./support.ts";
import type { Workspace } from "./support.ts";

const frameMs = 1000 / 30;

/** The text of each cue of a WebVTT text: the rows after its timing row. */
const cueTexts = (text: string): string[] =>
  Arr.map(
    Arr.filter(text.split("\n\n"), (block) => block.includes("-->")),
    (block) => {
      const rows = block.trim().split("\n");
      const timing = Arr.findFirstIndex(rows, (row) => row.includes("-->"));

      return Arr.join(
        Arr.drop(rows, Option.getOrElse(timing, () => 0) + 1),
        " "
      );
    }
  );

const streamOf = (media: MediaInfo, type: string) =>
  Option.getOrThrow(
    Arr.findFirst(media.streams, (stream) => stream.codec_type === type)
  );

const assertStreams = (media: MediaInfo, frames: number): void => {
  const video = streamOf(media, "video");
  const audio = streamOf(media, "audio");

  assert.strictEqual(video.codec_name, "h264");
  assert.strictEqual(video.nb_frames, frames);
  assert.strictEqual(video.r_frame_rate, "30/1");
  assert.strictEqual(audio.codec_name, "aac");
  assert.strictEqual(audio.sample_rate, 48_000);
  assert.strictEqual(audio.channels, 2);
  assert.strictEqual(streamOf(media, "subtitle").codec_name, "mov_text");
  // The fourth stream is the QuickTime chapter text track that ffmpeg's mp4 muxer writes next to the `chpl` atom.
  assert.deepStrictEqual(
    Arr.map(media.streams, (stream) => stream.codec_type),
    ["video", "audio", "subtitle", "data"]
  );
};

const assertChapters = (media: MediaInfo): void => {
  // One chapter per Section, titled with the Section text, at the first frame of its first Scene.
  assert.deepStrictEqual(
    Arr.map(media.chapters, (chapter) => [
      chapter.start_time,
      chapter.end_time,
      chapter.tags?.title,
    ]),
    [
      [0, 5.2, "Part one"],
      [5.2, 7.3, "Part two; =#\\ marks"],
    ]
  );
};

/** The `.vtt` beside the mp4 is the WebVTT of the Plan, and the `mov_text` stream holds the same cue texts. */
const assertSubtitles = Effect.fnUntraced(function* subtitles(built: {
  mp4: string;
  vtt: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* MediaTools;
  const plan = timedFixture();

  assert.strictEqual(yield* fs.readFileString(built.vtt), vtt(plan));
  assert.strictEqual(path.dirname(built.vtt), path.dirname(built.mp4));

  const embedded = new TextDecoder().decode(
    yield* tools.run("ffmpeg", [
      "-v",
      "error",
      "-i",
      built.mp4,
      "-map",
      "0:s:0",
      "-f",
      "webvtt",
      "pipe:1",
    ])
  );

  assert.deepStrictEqual(
    cueTexts(embedded),
    Arr.flatMap(plan.scenes, (scene) =>
      Arr.map(scene.lines, (line) => line.text)
    )
  );
});

/** Narration and the sound are where the Timeline says, within one frame. */
const assertAudio = Effect.fnUntraced(function* audio(
  workspace: Workspace,
  mp4: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const track = yield* decodeMonoPcm(mp4);

  const lines = Arr.flatMap(
    timedFixture().timeline.scenes,
    (scene) => scene.lines
  );

  for (const line of lines) {
    const reference = yield* decodeMonoPcm(
      path.join(workspace.cacheDir, line.audio.file)
    );

    const offset = audioOffsetMs(
      track,
      reference,
      (line.startFrame * 1000) / 30,
      150
    );

    yield* Effect.log(
      `${line.lineId} starts ${offset.toFixed(3)} ms from its frame`
    );
    assert.isAtMost(
      Math.abs(offset),
      frameMs,
      `${line.lineId} starts ${offset} ms from its frame`
    );
  }

  const pop = path.join(workspace.root, "pop.wav");

  yield* fs.writeFile(pop, sfxWav("pop"));

  const popOffset = audioOffsetMs(
    track,
    yield* decodeMonoPcm(pop),
    (65 * 1000) / 30,
    150
  );

  yield* Effect.log(`the pop sounds ${popOffset.toFixed(3)} ms from its Cue`);
  assert.isAtMost(
    Math.abs(popOffset),
    frameMs,
    `the pop sounds ${popOffset} ms from its Cue`
  );
});

it.live(
  "the fixture story becomes an mp4 that holds its streams, chapters, subtitles and sounds",
  () =>
    Effect.gen(function* container() {
      const plan = timedFixture();
      const workspace = yield* makeWorkspace;
      const built = yield* buildFixture(workspace, "story");
      const media = yield* probeMedia(built.mp4);

      assertStreams(media, plan.timeline.totalFrames);
      assertChapters(media);
      // The title, and the source hash of the Plan.
      assert.strictEqual(media.format.tags?.title, plan.title);
      assert.strictEqual(
        media.format.tags?.comment,
        `reebeat source-sha256 ${plan.sourceSha256}`
      );
      yield* assertSubtitles(built);
      yield* assertAudio(workspace, built.mp4);
    }).pipe(Effect.provide(services))
);

it.live(
  "two builds in two fresh browser launches decode to the same frames and samples",
  () =>
    Effect.gen(function* twice() {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeWorkspace;
      const first = yield* buildFixture(workspace, "first");
      const second = yield* buildFixture(workspace, "second");

      assert.deepStrictEqual(
        yield* frameHashes(second.mp4),
        yield* frameHashes(first.mp4)
      );
      assert.deepStrictEqual(
        yield* decodeMonoPcm(second.mp4),
        yield* decodeMonoPcm(first.mp4)
      );

      // Recorded, not asserted: whether the container bytes are equal too.
      const left = yield* fs.readFile(first.mp4);
      const right = yield* fs.readFile(second.mp4);

      const same =
        left.byteLength === right.byteLength &&
        Arr.every(Arr.zip(left, right), ([a, b]) => a === b);

      yield* Effect.log(
        `container bytes of two builds: ${left.byteLength} and ${right.byteLength}, ${same ? "identical" : "different"}`
      );
    }).pipe(Effect.provide(services))
);

it.live(
  "a capture past its deadline fails with CaptureTimeout and leaves nothing in the output directory",
  () =>
    Effect.gen(function* deadline() {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* makeWorkspace;

      const failure = yield* muxVideo(
        timedFixture(),
        framesOf(workspace, undefined, { timeoutSeconds: 1.5 }),
        {
          cacheDir: workspace.cacheDir,
          name: "late",
          outDir: workspace.outDir,
        }
      ).pipe(Effect.flip);

      assert.isTrue(Predicate.isTagged(failure, "CaptureTimeout"));
      assert.deepStrictEqual(yield* fs.readDirectory(workspace.outDir), []);
    }).pipe(Effect.provide(services))
);

// What the capture tests share: the services of a real run (Chromium and the file system), a temporary workspace
// with the fixture deck and reveal.js next to it, and ffmpeg as the PNG decoder (`image2pipe`) for what the frames
// show. ffmpeg is the tests' tool here, not the adapter's: the capture only emits the PNG stream.
import { NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { Browser } from "../src/browser.ts";
import { captureFrames } from "../src/capture.ts";
import type { CaptureOptions } from "../src/capture.ts";
import { captureSchedule } from "../src/captureSchedule.ts";
import type { CaptureSchedule } from "../src/captureSchedule.ts";
import { fixture } from "./fixturePlan.ts";

/** The platform services (file system, path, child processes) the tests give the adapters. */
export const nodeServices = NodeServices.layer;

/** The services of a real run: Chromium and the file system. */
export const services = Browser.layer.pipe(Layer.provideMerge(nodeServices));

export interface Workspace {
  readonly deckDir: string;
  readonly deckUrl: string;
}

/** A temporary directory with the fixture deck page and reveal.js next to it. */
export const makeWorkspace = Effect.gen(function* workspace() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const root = yield* fs.makeTempDirectoryScoped({
    prefix: "tsukuri-capture-",
  });

  const deckDir = path.join(root, "deck");
  const assets = path.join(deckDir, "assets");

  const local = (relative: string) =>
    path.fromFileUrl(new URL(relative, import.meta.url));

  yield* fs.makeDirectory(assets, { recursive: true });
  yield* fs.copyFile(
    yield* local("./fixtures/deck/deck.html"),
    path.join(deckDir, "deck.html")
  );

  for (const file of ["reveal.js", "reveal.css"]) {
    yield* fs.copyFile(
      yield* local(`../node_modules/reveal.js/dist/${file}`),
      path.join(assets, file)
    );
  }

  return {
    deckDir,
    deckUrl: (yield* path.toFileUrl(path.join(deckDir, "deck.html"))).href,
  } satisfies Workspace;
});

/** The captured frames of the fixture, with a schedule the caller may have changed. */
export const framesOf = (
  workspace: Workspace,
  schedule: CaptureSchedule = captureSchedule(fixture),
  options: Partial<CaptureOptions> = {}
) =>
  captureFrames(schedule, {
    deckUrl: workspace.deckUrl,
    settleNewAnimations: true,
    ...options,
  });

const joined = (chunks: readonly Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(
    Arr.reduce(chunks, 0, (sum, chunk) => sum + chunk.byteLength)
  );

  Arr.reduce(chunks, 0, (offset, chunk) => {
    bytes.set(chunk, offset);

    return offset + chunk.byteLength;
  });

  return bytes;
};

/** What ffmpeg writes for the PNG frames of a stream (`-f image2pipe`) when given `outputArgs`. */
const ffmpegOver = Effect.fn("ffmpegOver")(function* ffmpegOver<E, R>(
  frames: Stream.Stream<Uint8Array, E, R>,
  outputArgs: readonly string[]
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const png = yield* Stream.runCollect(frames);
  const input = ["-f", "image2pipe", "-c:v", "png", "-i", "pipe:0"];

  const command = ChildProcess.make(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", ...input, ...outputArgs, "pipe:1"],
    { stdin: Stream.fromIterable(png) }
  );

  return yield* Effect.scoped(
    Effect.gen(function* run() {
      const handle = yield* spawner.spawn(command);
      const output = yield* Stream.runCollect(handle.stdout);
      const exitCode = yield* handle.exitCode;

      return exitCode === 0
        ? joined(output)
        : yield* Effect.die(`ffmpeg exited with code ${exitCode}`);
    })
  );
});

/** The MD5 of every frame once decoded (`-f framemd5`): lossless, before any encoding. */
export const pngFrameHashes = <E, R>(frames: Stream.Stream<Uint8Array, E, R>) =>
  Effect.map(ffmpegOver(frames, ["-f", "framemd5"]), (output) =>
    Arr.map(
      Arr.filter(
        Str.split(new TextDecoder().decode(output), "\n"),
        (row) => row !== "" && !Str.startsWith("#")(row)
      ),
      (row) => Str.trim(Arr.lastNonEmpty(Str.split(row, ",")))
    )
  );

const grayFrameBytes = 1280 * 720;

/** The frames as gray pixels, one `Uint8Array` of `grayFrameBytes` each. */
export const pngGrayFrames = <E, R>(frames: Stream.Stream<Uint8Array, E, R>) =>
  Effect.map(
    ffmpegOver(frames, ["-pix_fmt", "gray", "-f", "rawvideo"]),
    (bytes) =>
      Arr.makeBy(Math.floor(bytes.byteLength / grayFrameBytes), (index) =>
        bytes.subarray(index * grayFrameBytes, (index + 1) * grayFrameBytes)
      )
  );

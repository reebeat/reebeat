// What the integration tests share: the services of a real run, and a temporary workspace with the fixture deck,
// reveal.js next to it, a speech cache of tiny generated FLAC files and an output directory.
import { NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, FileSystem, Layer, Path, Stream } from "effect";

import { Browser } from "../src/browser.ts";
import { captureFrames } from "../src/capture.ts";
import type { CaptureOptions } from "../src/capture.ts";
import { captureSchedule } from "../src/captureSchedule.ts";
import type { CaptureSchedule } from "../src/captureSchedule.ts";
import { MediaTools } from "../src/mediaTools.ts";
import { muxVideo } from "../src/mux.ts";
import type { TimedPlan } from "../src/timedPlan.ts";
import { timedFixture } from "./fixturePlan.ts";

/** The services of a real run: ffmpeg, Chromium, the file system. */
export const services = Layer.mergeAll(MediaTools.layer, Browser.layer).pipe(
  Layer.provideMerge(NodeServices.layer)
);

export interface Workspace {
  readonly cacheDir: string;
  readonly deckUrl: string;
  readonly outDir: string;
  readonly root: string;
}

// Seeded noise, not a tone: a tone correlates with itself at every whole period, so a shift could not be told.
const seeds = [11, 22, 33];

/** Writes one mono 24 kHz FLAC of seeded white noise per Line of `plan` into `cacheDir`, as long as the Line. */
export const writeNarration = Effect.fnUntraced(function* writeNarration(
  plan: TimedPlan,
  cacheDir: string
) {
  const tools = yield* MediaTools;
  const path = yield* Path.Path;
  const lines = Arr.flatMap(plan.timeline.scenes, (scene) => scene.lines);

  for (const [index, line] of lines.entries()) {
    const seconds = (line.endFrame - line.startFrame) / 30;
    const source = `anoisesrc=color=white:seed=${seeds[index % seeds.length] ?? 1}:amplitude=0.4:duration=${seconds}:sample_rate=24000`;

    yield* tools.run("ffmpeg", [
      ...`-hide_banner -loglevel error -y -f lavfi -i ${source} -ac 1 -c:a flac`.split(
        " "
      ),
      path.join(cacheDir, line.audio.file),
    ]);
  }
});

/** The `Workspace` of a root directory holding `deck/deck.html`, with its narration in `cacheDir`. */
export const locateWorkspace = Effect.fnUntraced(function* locateWorkspace(
  root: string,
  cacheDir: string
) {
  const path = yield* Path.Path;

  return {
    cacheDir,
    deckUrl: (yield* path.toFileUrl(path.join(root, "deck", "deck.html"))).href,
    outDir: path.join(root, "out"),
    root,
  } satisfies Workspace;
});

/** A temporary directory with the deck page, its assets, the narration FLACs and an output directory. */
export const makeWorkspace = Effect.gen(function* workspace() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-video-" });
  const assets = path.join(root, "deck", "assets");
  const cacheDir = path.join(root, "cache");

  const local = (relative: string) =>
    path.fromFileUrl(new URL(relative, import.meta.url));

  yield* fs.makeDirectory(assets, { recursive: true });
  yield* fs.makeDirectory(cacheDir, { recursive: true });
  yield* fs.copyFile(
    yield* local("./fixtures/deck/deck.html"),
    path.join(root, "deck", "deck.html")
  );

  for (const file of ["reveal.js", "reveal.css"]) {
    yield* fs.copyFile(
      yield* local(`../node_modules/reveal.js/dist/${file}`),
      path.join(assets, file)
    );
  }

  yield* writeNarration(timedFixture(), cacheDir);

  return yield* locateWorkspace(root, cacheDir);
});

/** The captured frames of the fixture, with a schedule the caller may have changed. */
export const framesOf = (
  workspace: Workspace,
  schedule: CaptureSchedule = captureSchedule(timedFixture()),
  options: Partial<CaptureOptions> = {}
) =>
  captureFrames(schedule, {
    deckUrl: workspace.deckUrl,
    settleNewAnimations: true,
    ...options,
  });

/** Captures the fixture and muxes it into `<name>.mp4` of the workspace's output directory. */
export const buildFixture = (
  workspace: Workspace,
  name: string,
  options: Partial<CaptureOptions> = {}
) =>
  muxVideo(timedFixture(), framesOf(workspace, undefined, options), {
    cacheDir: workspace.cacheDir,
    name,
    outDir: workspace.outDir,
  });

/** Runs `outputArgs` over the PNG frames of a stream (`ffmpeg -f image2pipe`) and returns what ffmpeg prints. */
const decodePngFrames = Effect.fn("decodePngFrames")(function* decode<E, R>(
  frames: Stream.Stream<Uint8Array, E, R>,
  outputArgs: readonly string[]
) {
  const tools = yield* MediaTools;

  const process = yield* tools.start("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    ...outputArgs,
    "pipe:1",
  ]);

  yield* Stream.run(frames, process.stdin);

  return yield* process.finish;
});

/** The MD5 of every PNG frame of a stream once decoded (`ffmpeg -f framemd5`): lossless, before any encoding. */
export const pngFrameHashes = <E, R>(frames: Stream.Stream<Uint8Array, E, R>) =>
  Effect.map(decodePngFrames(frames, ["-f", "framemd5"]), (output) =>
    Arr.map(
      Arr.filter(
        new TextDecoder().decode(output).split("\n"),
        (row) => row !== "" && !row.startsWith("#")
      ),
      (row) => (row.split(",").at(-1) ?? "").trim()
    )
  );

/** The same frames as gray pixels: `frames[i]` is bytes `[i * 921600, (i + 1) * 921600)` of the output. */
export const pngGrayFrames = <E, R>(frames: Stream.Stream<Uint8Array, E, R>) =>
  Effect.map(
    decodePngFrames(frames, ["-pix_fmt", "gray", "-f", "rawvideo"]),
    (bytes) =>
      Arr.makeBy(Math.floor(bytes.byteLength / (1280 * 720)), (index) =>
        bytes.subarray(index * 1280 * 720, (index + 1) * 1280 * 720)
      )
  );

const here = (relative: string): string =>
  decodeURIComponent(new URL(relative, import.meta.url).pathname);

/** A file of the package, `relative` to this directory, as UTF-8 text. */
export const readLocal = (relative: string) =>
  Effect.provide(
    Effect.flatMap(FileSystem.FileSystem, (fs) =>
      fs.readFileString(here(relative))
    ),
    NodeServices.layer
  );

/** Every `.ts` file under `src`, with its name. */
export const readSources = Effect.provide(
  Effect.gen(function* sources() {
    const fs = yield* FileSystem.FileSystem;

    const names = Arr.filter(yield* fs.readDirectory(here("../src/")), (name) =>
      name.endsWith(".ts")
    );

    return yield* Effect.forEach(names, (name) =>
      Effect.map(fs.readFileString(here(`../src/${name}`)), (text) => ({
        name,
        text,
      }))
    );
  }),
  NodeServices.layer
);

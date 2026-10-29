// The mux: the captured frames (on ffmpeg's stdin), the mixed audio, the subtitles and the chapters become one mp4.
// ffmpeg writes into a temporary directory beside the output; the file is renamed into place only after ffmpeg exited
// with 0, and any earlier failure (or a failure of the frame stream, such as a capture timeout) removes the
// directory, so no partial output is left. An output of an earlier build is removed first, so a failed build leaves
// none that a check could accept.
//
// Determinism flags: `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact -map_metadata:g -1` (`settings.ts`).
import { requireOutputName } from "@reebeat/services";
import type { MuxRequest } from "@reebeat/services";
import { Array as Arr, Effect, FileSystem, Path, Ref, Stream } from "effect";

import { audioMix } from "./audioMix.ts";
import type { AudioMixPlan } from "./audioMix.ts";
import { MediaToolFailed } from "./errors.ts";
import { ffmetadata } from "./ffmetadata.ts";
import { MediaTools } from "./mediaTools.ts";
import {
  audioArgs,
  bitexactArgs,
  subtitleArgs,
  videoArgs,
} from "./settings.ts";

export interface MuxPaths {
  readonly ffmetadata: string;
  readonly output: string;
  /** One raw f32le mono file per track, in track order. */
  readonly tracks: readonly string[];
  readonly vtt: string;
}

/** The ffmpeg arguments of the mux: frames on stdin (input 0), the tracks, the subtitles, the chapters. */
export const muxArgs = (
  request: Pick<MuxRequest, "fps" | "height" | "metadata" | "tracks" | "width">,
  mix: AudioMixPlan,
  paths: MuxPaths
): string[] => {
  const trackInputs = Arr.flatMap(request.tracks, ({ clip }, index) => [
    "-f",
    "f32le",
    "-ar",
    String(clip.sampleRate),
    "-ac",
    "1",
    "-i",
    paths.tracks[index] ?? "",
  ]);

  const subtitleIndex = 1 + request.tracks.length;
  const metadataIndex = subtitleIndex + 1;

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(request.fps),
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    ...trackInputs,
    "-i",
    paths.vtt,
    "-i",
    paths.ffmetadata,
    "-filter_complex",
    mix.filterComplex,
    "-vf",
    `scale=${request.width}:${request.height}:out_color_matrix=bt709:out_range=tv`,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-map",
    `${subtitleIndex}:s`,
    "-map_chapters",
    String(metadataIndex),
    "-map_metadata:g",
    "-1",
    "-metadata",
    `title=${request.metadata.title}`,
    "-metadata",
    `comment=${request.metadata.comment}`,
    ...subtitleArgs,
    ...videoArgs,
    "-r",
    String(request.fps),
    ...audioArgs,
    "-movflags",
    "+faststart",
    ...bitexactArgs,
    "-f",
    "mp4",
    paths.output,
  ];
};

const bytesOf = (samples: Float32Array): Uint8Array =>
  new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);

/** Writes the tracks, the subtitles and the chapters into `scratch` and returns where. */
const writeInputs = Effect.fnUntraced(function* writeInputs(
  request: MuxRequest,
  scratch: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const paths: MuxPaths = {
    ffmetadata: path.join(scratch, "chapters.ffmetadata"),
    output: path.join(scratch, "out.mp4"),
    tracks: Arr.map(request.tracks, (_, index) =>
      path.join(scratch, `track${index}.f32`)
    ),
    vtt: path.join(scratch, "out.vtt"),
  };

  yield* Effect.forEach(
    request.tracks,
    ({ clip }, index) =>
      fs.writeFile(paths.tracks[index] ?? "", bytesOf(clip.samples)),
    { discard: true }
  );
  yield* fs.writeFileString(paths.vtt, request.vtt);
  yield* fs.writeFileString(paths.ffmetadata, ffmetadata(request.chapters));

  return paths;
});

/**
 * Writes `request.outPath` from the frames, the tracks, the subtitles and the chapters of `request`. The frame
 * stream's own failure fails the mux unchanged and leaves nothing beside the output. Counts the frames it piped.
 */
export const muxMedia = Effect.fn("muxMedia")(function* muxMedia(
  request: MuxRequest
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* MediaTools;

  yield* requireOutputName(path.basename(request.outPath));
  yield* fs.makeDirectory(path.dirname(request.outPath), { recursive: true });
  yield* fs.remove(request.outPath, { force: true });

  const scratch = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(request.outPath),
    prefix: ".mux-",
  });

  const paths = yield* writeInputs(request, scratch);

  const mix = audioMix(
    Arr.map(request.tracks, ({ startMs }) => startMs),
    request.totalMs,
    1
  );

  const ffmpeg = yield* tools.start("ffmpeg", muxArgs(request, mix, paths));
  const frames = yield* Ref.make(0);

  // A write that fails because ffmpeg died is reported with ffmpeg's own error text.
  yield* Stream.run(
    Stream.tap(request.frames, () => Ref.update(frames, (count) => count + 1)),
    ffmpeg.stdin
  ).pipe(
    Effect.catchTag("PlatformError", (writeError) =>
      Effect.matchEffect(ffmpeg.finish, {
        onFailure: (exited) => Effect.fail(exited),
        onSuccess: () =>
          Effect.fail(
            new MediaToolFailed({
              cause: writeError,
              message: `writing to ffmpeg failed: ${writeError.message}`,
              stderr: "",
              tool: "ffmpeg",
            })
          ),
      })
    )
  );
  yield* ffmpeg.finish;

  yield* fs.rename(paths.output, request.outPath);

  const { size } = yield* fs.stat(request.outPath);

  return {
    bytes: Number(size),
    frames: yield* Ref.get(frames),
    path: request.outPath,
  };
});

import { sampleRate, sfxWav } from "@reebeat/sfx";
// The mux: the captured frames (on ffmpeg's stdin), the mixed audio, the subtitles and the chapters become
// `<name>.mp4`, and the WebVTT text becomes `<name>.vtt` beside it. ffmpeg writes into a temporary directory inside
// the output directory; the files are renamed into place only after ffmpeg exited with 0, and any earlier failure
// (or a timeout of the capture) removes the directory, so no partial output is left. Outputs of an earlier build
// are removed first, so a failed build leaves none that a check could accept.
//
// Determinism flags: `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact -map_metadata:g -1`. The spec writes
// `-map_metadata -1`; measured with ffmpeg 9.0.1, that also drops the chapter titles, so only the global metadata
// (the input's tags) is dropped and the title and comment are set explicitly.
import { Array as Arr, Effect, FileSystem, Path, Stream } from "effect";

import { audioMixPlan } from "./audioMix.ts";
import type { AudioInput, AudioMixPlan } from "./audioMix.ts";
import { InvalidOutputName, MediaToolFailed, OutputFailed } from "./errors.ts";
import type { BrowserFailed, CaptureTimeout } from "./errors.ts";
import { ffmetadata } from "./ffmetadata.ts";
import { MediaTools } from "./mediaTools.ts";
import type { TimedPlan } from "./timedPlan.ts";
import { vtt } from "./vtt.ts";

export interface MuxPaths {
  readonly ffmetadata: string;
  readonly narrationDir: string;
  readonly output: string;
  readonly sfxDir: string;
  readonly vtt: string;
}

const inputPath = (paths: MuxPaths, input: AudioInput): string =>
  input.kind === "narration"
    ? `${paths.narrationDir}/${input.file}`
    : `${paths.sfxDir}/${input.name}.wav`;

/** The ffmpeg arguments of the mux: frames on stdin (input 0), the audio inputs, the subtitles, the chapters. */
export const muxArgs = (
  plan: TimedPlan,
  mix: AudioMixPlan,
  paths: MuxPaths
): string[] => {
  const { fps } = plan.settings;

  const audioInputs = Arr.flatMap(mix.inputs, (input) => [
    "-i",
    inputPath(paths, input),
  ]);

  const subtitleIndex = 1 + mix.inputs.length;
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
    String(fps),
    "-c:v",
    "png",
    "-i",
    "pipe:0",
    ...audioInputs,
    "-i",
    paths.vtt,
    "-i",
    paths.ffmetadata,
    "-filter_complex",
    mix.filterComplex,
    "-vf",
    "scale=out_color_matrix=bt709:out_range=tv",
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
    `title=${plan.title}`,
    "-metadata",
    `comment=reebeat source-sha256 ${plan.sourceSha256}`,
    "-metadata:s:s:0",
    "language=eng",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-r",
    String(fps),
    "-threads",
    "4",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ar",
    String(sampleRate),
    "-ac",
    "2",
    "-c:s",
    "mov_text",
    "-movflags",
    "+faststart",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    "-f",
    "mp4",
    paths.output,
  ];
};

export interface MuxOptions {
  /** The speech cache directory: `audio.file` of every Line is relative to it. */
  readonly cacheDir: string;
  /** The output file name without extension. */
  readonly name: string;
  /** The directory that receives `<name>.mp4` and `<name>.vtt`; created if absent. */
  readonly outDir: string;
}

export interface MuxResult {
  readonly mp4: string;
  readonly vtt: string;
}

/** A plain file stem: it starts with a letter or digit and holds letters, digits, `.`, `_` and `-` only. */
const stemPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/** The name as a stem, or why it is not one. `..` inside a name is refused too. */
const requireStem = (name: string): Effect.Effect<string, InvalidOutputName> =>
  stemPattern.test(name) && !name.includes("..")
    ? Effect.succeed(name)
    : Effect.fail(
        new InvalidOutputName({
          message: `the output name ${JSON.stringify(name)} is not a plain file stem (letters, digits, ".", "_" and "-", starting with a letter or digit, no "..")`,
          stem: name,
        })
      );

const output = (path: string, message: string) => (cause: unknown) =>
  new OutputFailed({ cause, message, path });

/**
 * Writes `<name>.mp4` and `<name>.vtt` from the frames of a capture. The frame stream's own failure (a capture
 * timeout, a browser error) fails the mux unchanged and leaves nothing in `outDir`.
 */
export const muxVideo = Effect.fn("muxVideo")(function* mux<R>(
  plan: TimedPlan,
  frames: Stream.Stream<Uint8Array, BrowserFailed | CaptureTimeout, R>,
  options: MuxOptions
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* MediaTools;
  const stem = yield* requireStem(options.name);

  const target = {
    mp4: path.join(options.outDir, `${stem}.mp4`),
    vtt: path.join(options.outDir, `${stem}.vtt`),
  };

  yield* fs
    .makeDirectory(options.outDir, { recursive: true })
    .pipe(
      Effect.mapError(
        output(options.outDir, "cannot create the output directory")
      )
    );
  yield* Effect.forEach(
    [target.mp4, target.vtt],
    (file) => fs.remove(file, { force: true }),
    { discard: true }
  ).pipe(
    Effect.mapError(
      output(options.outDir, "cannot remove the outputs of an earlier build")
    )
  );

  return yield* Effect.scoped(
    Effect.gen(function* muxScoped() {
      const scratch = yield* fs
        .makeTempDirectoryScoped({ directory: options.outDir, prefix: ".mux-" })
        .pipe(
          Effect.mapError(
            output(options.outDir, "cannot create the scratch directory")
          )
        );

      const mix = yield* Effect.fromResult(audioMixPlan(plan));

      const paths: MuxPaths = {
        ffmetadata: path.join(scratch, "chapters.ffmetadata"),
        narrationDir: path.resolve(options.cacheDir),
        output: path.join(scratch, "out.mp4"),
        sfxDir: path.join(scratch, "sfx"),
        vtt: path.join(scratch, "out.vtt"),
      };

      const sounds = [
        ...new Set(
          Arr.flatMap(mix.inputs, (input) =>
            input.kind === "sfx" ? [input.name] : []
          )
        ),
      ];

      yield* fs
        .makeDirectory(paths.sfxDir)
        .pipe(
          Effect.mapError(
            output(paths.sfxDir, "cannot create the sfx directory")
          )
        );
      yield* Effect.forEach(
        sounds,
        (name) => fs.writeFile(`${paths.sfxDir}/${name}.wav`, sfxWav(name)),
        { discard: true }
      ).pipe(Effect.mapError(output(paths.sfxDir, "cannot write a sound")));
      yield* fs
        .writeFileString(paths.vtt, vtt(plan))
        .pipe(Effect.mapError(output(paths.vtt, "cannot write the subtitles")));
      yield* fs
        .writeFileString(paths.ffmetadata, ffmetadata(plan))
        .pipe(
          Effect.mapError(output(paths.ffmetadata, "cannot write the chapters"))
        );

      const ffmpeg = yield* tools.start("ffmpeg", muxArgs(plan, mix, paths));

      // A write that fails because ffmpeg died is reported with ffmpeg's own error text.
      yield* Stream.run(frames, ffmpeg.stdin).pipe(
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

      yield* fs
        .rename(paths.vtt, target.vtt)
        .pipe(Effect.mapError(output(target.vtt, "cannot move the subtitles")));
      yield* fs
        .rename(paths.output, target.mp4)
        .pipe(Effect.mapError(output(target.mp4, "cannot move the video")));

      return target satisfies MuxResult;
    })
  );
});

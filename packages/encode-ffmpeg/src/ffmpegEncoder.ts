// Encoder on ffmpeg (spec 0001, design R3): lossless audio (`encodeAudio`, `decodeAudio`) and the mux of PNG frames,
// the mixed audio, subtitles and chapters into an mp4. Foreign ABI: the `ffmpeg` and `ffprobe` processes, run
// through `MediaTools` over Effect's `ChildProcessSpawner`. `info.id` is `ffmpeg@<version>`, read once from
// `ffmpeg -version` when the layer is built; when ffmpeg cannot start the layer still builds, its id says
// `unavailable`, and every operation raises `AdapterUnavailable` (never a fallback). Retirement: an ffmpeg binding
// that encodes in process.
import {
  Encoder,
  EncodeFailed,
  AdapterUnavailable,
  localEgress,
} from "@tsukuri/services";
import type { AudioClip, MuxRequest } from "@tsukuri/services";
import type { FileSystem, Path } from "effect";
import { Array as Arr, Effect, Layer, Option, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { decodeFlac, encodeFlac } from "./audioCodec.ts";
import { MediaTools } from "./mediaTools.ts";
import { muxMedia } from "./mux.ts";
import {
  audioArgs,
  flacArgs,
  outputSampleRate,
  subtitleArgs,
  videoArgs,
} from "./settings.ts";

/** The version in the first line of `ffmpeg -version`: `ffmpeg version 9.0.1 Copyright ...`. */
const versionOf = (banner: string): Option.Option<string> =>
  Option.fromNullishOr(
    /^ffmpeg version (?<version>\S+)/u.exec(banner)?.groups?.version
  );

const unavailable = (adapter: string) =>
  new AdapterUnavailable({
    adapter,
    message: "cannot run ffmpeg: it is not on the PATH or does not start",
    requirement: "binary ffmpeg",
    service: "Encoder",
  });

/** `Encoder` through the `ffmpeg` and `ffprobe` on the `PATH`. */
const encoderLayer = Layer.effect(
  Encoder,
  Effect.gen(function* ffmpegEncoderLayer() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const context = yield* Effect.context<
      FileSystem.FileSystem | MediaTools | Path.Path
    >();

    const banner = yield* Effect.option(
      Effect.scoped(
        Effect.flatMap(
          spawner.spawn(
            ChildProcess.make("ffmpeg", ["-version"], { stdin: "ignore" })
          ),
          (handle) => Stream.mkString(Stream.decodeText(handle.stdout))
        )
      )
    );

    const version = Option.flatMap(banner, versionOf);
    const adapter = `ffmpeg@${Option.getOrElse(version, () => "unavailable")}`;

    /** Runs `use` only when ffmpeg started at build time; otherwise `AdapterUnavailable`. */
    const available = Effect.fnUntraced(function* available<A, E>(
      use: Effect.Effect<A, E, FileSystem.FileSystem | MediaTools | Path.Path>
    ): Effect.fn.Return<A, AdapterUnavailable | E> {
      if (Option.isNone(version)) {
        return yield* unavailable(adapter);
      }

      return yield* Effect.provideContext(use, context);
    });

    const failed =
      (operation: EncodeFailed["operation"], message: string) =>
      (cause: unknown) =>
        new EncodeFailed({ adapter, cause, message, operation });

    const encodeAudio = Effect.fn("Encoder.encodeAudio")(function* encodeAudio(
      clip: AudioClip
    ) {
      return yield* available(encodeFlac(clip)).pipe(
        Effect.catchTags({
          MediaToolFailed: (cause) =>
            Effect.fail(
              failed("encodeAudio", "ffmpeg could not encode the clip")(cause)
            ),
          PlatformError: (cause) =>
            Effect.fail(
              failed(
                "encodeAudio",
                "cannot move audio through a temporary file"
              )(cause)
            ),
        })
      );
    });

    const decodeAudio = Effect.fn("Encoder.decodeAudio")(function* decodeAudio(
      bytes: Uint8Array
    ) {
      return yield* available(decodeFlac(bytes)).pipe(
        Effect.catchTags({
          MediaToolFailed: (cause) =>
            Effect.fail(
              failed("decodeAudio", "ffmpeg could not decode the audio")(cause)
            ),
          PlatformError: (cause) =>
            Effect.fail(
              failed(
                "decodeAudio",
                "cannot move audio through a temporary file"
              )(cause)
            ),
        })
      );
    });

    const mux = Effect.fn("Encoder.mux")(function* mux(request: MuxRequest) {
      // The mux writes `fps` as a whole frame rate; the 1000/1001 fraction is refused, not rounded to a wrong video.
      if (request.ntsc) {
        return yield* new AdapterUnavailable({
          adapter,
          message: `the ffmpeg encoder writes whole frame rates only: settings.ntsc ${request.ntsc} (${request.fps * 1000}/1001 fps) is not supported`,
          requirement: "settings.ntsc false",
          service: "Encoder",
        });
      }

      return yield* available(Effect.scoped(muxMedia(request))).pipe(
        Effect.catchTags({
          InvalidOutputName: (cause) =>
            Effect.fail(failed("mux", cause.message)(cause)),
          MediaToolFailed: (cause) =>
            Effect.fail(
              failed("mux", "ffmpeg could not write the media file")(cause)
            ),
          PlatformError: (cause) =>
            Effect.fail(
              failed("mux", `cannot write ${request.outPath}`)(cause)
            ),
        })
      );
    });

    return Encoder.of({
      decodeAudio,
      encodeAudio,
      info: {
        egress: localEgress,
        id: adapter,
        settings: {
          audio: Arr.join(audioArgs, " "),
          flac: Arr.join(flacArgs, " "),
          outputSampleRate,
          subtitles: Arr.join(subtitleArgs, " "),
          video: Arr.join(videoArgs, " "),
        },
      },
      mux,
    });
  })
);

/** `Encoder` through ffmpeg: needs the platform file system, path and child-process spawner. */
export const ffmpegEncoder = Layer.provide(encoderLayer, MediaTools.layer);

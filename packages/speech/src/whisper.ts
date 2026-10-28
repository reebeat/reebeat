// Aligner on whisper.cpp: the cached FLAC is decoded to 16 kHz mono s16 WAV by ffmpeg and read by `whisper-cli`
// as `-ml 1 -sow -oj -np -t 4` (one JSON entry per word, times in milliseconds). The pinned whisper version and
// model hash (`pipeline.ts`) are checked on first use, because they are part of every cache key: a different
// model under the same key would silently produce other times.
import {
  Array as Arr,
  Config,
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
} from "effect";
import { ChildProcessSpawner } from "effect/process";

import type { HeardWord } from "./align.ts";
import { SpeechToolFailed } from "./errors.ts";
import { sha256Hex } from "./key.ts";
import { pipeline } from "./pipeline.ts";
import { Aligner } from "./services.ts";
import { runTool, toolFailure } from "./tool.ts";

/** The model file and the binary; `REEBEAT_WHISPER_BIN` defaults to `whisper-cli` on the `PATH`. */
export const whisperConfig = Config.all({
  bin: Config.String("REEBEAT_WHISPER_BIN").pipe(
    Config.withDefault("whisper-cli")
  ),
  model: Config.String("REEBEAT_WHISPER_MODEL"),
});

const WhisperOutput = Schema.fromJsonString(
  Schema.Struct({
    transcription: Schema.Array(
      Schema.Struct({
        offsets: Schema.Struct({ from: Schema.Int, to: Schema.Int }),
        text: Schema.String,
      })
    ),
  })
);

const decodeOutput = Schema.decodeUnknownEffect(WhisperOutput);

/** The words of whisper's JSON: the empty segments (the one before the first word) are dropped. */
export const heardWords = (
  json: string
): Effect.Effect<readonly HeardWord[], SpeechToolFailed> =>
  Effect.map(
    Effect.mapError(
      decodeOutput(json),
      toolFailure("whisper", "whisper wrote JSON of an unexpected shape")
    ),
    ({ transcription }) =>
      Arr.flatMap(transcription, ({ offsets, text }) =>
        text.trim() === ""
          ? []
          : [{ endMs: offsets.to, startMs: offsets.from, w: text.trim() }]
      )
  );

/** `Aligner` through `whisper-cli` and the `ffmpeg` on the `PATH`. */
export const alignerWhisper = Layer.effect(
  Aligner,
  Effect.gen(function* alignerWhisperLayer() {
    const { bin, model } = yield* whisperConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const crypto = yield* Crypto.Crypto;

    const fail = toolFailure(
      "whisper",
      "cannot move audio through a temporary file"
    );

    const pinned = Effect.gen(function* pinnedWhisper() {
      const banner = yield* runTool(spawner, "whisper", bin, ["--version"]);

      const version = /whisper\.cpp version: (?<version>\S+)/u.exec(banner)
        ?.groups?.version;

      if (version !== pipeline.whisperCpp) {
        return yield* new SpeechToolFailed({
          cause: banner,
          message: `${bin} is whisper.cpp ${version ?? "of unknown version"}, the cache keys name ${pipeline.whisperCpp}`,
          tool: "whisper",
        });
      }

      const bytes = yield* Effect.mapError(
        fs.readFile(model),
        toolFailure("whisper", `cannot read the model ${model}`)
      );

      const sha256 = yield* Effect.mapError(
        Effect.provideService(sha256Hex(bytes), Crypto.Crypto, crypto),
        toolFailure("sha256", `cannot hash the model ${model}`)
      );

      if (sha256 !== pipeline.whisperModelSha256) {
        return yield* new SpeechToolFailed({
          cause: sha256,
          message: `${model} has SHA-256 ${sha256}, the cache keys name ${pipeline.whisperModelSha256}`,
          tool: "whisper",
        });
      }

      return sha256;
    });

    const verified = yield* Effect.cached(pinned);

    const align = Effect.fn("Aligner.align")(function* align(flac: Uint8Array) {
      yield* verified;

      const directory = yield* Effect.mapError(
        fs.makeTempDirectoryScoped({ prefix: "reebeat-whisper-" }),
        fail
      );

      const input = path.join(directory, "in.flac");
      const wav = path.join(directory, "in.wav");
      const base = path.join(directory, "words");

      yield* Effect.mapError(fs.writeFile(input, flac), fail);
      yield* runTool(spawner, "ffmpeg", "ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        input,
        ...pipeline.resampleArgs,
        wav,
      ]);
      yield* runTool(spawner, "whisper", bin, [
        "-m",
        model,
        "-f",
        wav,
        ...pipeline.whisperArgs,
        "-of",
        base,
      ]);

      return yield* Effect.flatMap(
        Effect.mapError(fs.readFileString(`${base}.json`), fail),
        heardWords
      );
    }, Effect.scoped);

    return Aligner.of({ align });
  })
);

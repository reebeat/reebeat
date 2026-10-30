// WordAligner on whisper.cpp: the clip becomes a 16 kHz mono s16 WAV through ffmpeg and `whisper-cli` hears it as
// `-ml 1 -sow -oj -np -t 4` (one JSON entry per word, times in milliseconds); the heard words are matched to the
// requested words by `alignWords` (the core's pure dynamic programme). The pinned whisper version and model hash
// are checked on first use, because they are part of every cache key: a different model under the same key would
// silently produce other times. A missing binary, model or environment variable is `AdapterUnavailable`, raised
// then, never when the layer is built and never as a fallback. Foreign ABI: the `whisper-cli` and `ffmpeg`
// processes. Retirement: a whisper binding that returns word times in process.
import { alignWords } from "@tsukuri/core";
import type { HeardWord } from "@tsukuri/core";
import { WordAligner, localEgress } from "@tsukuri/services";
import type { AlignRequest } from "@tsukuri/services";
import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  String as Str,
} from "effect";
import { Digest } from "effect/crypto";
import { ChildProcessSpawner } from "effect/process";

import { adapterId, alignFailure, runTool, unavailable } from "./tool.ts";

const whisperCpp = "1.9.5-dev";
const modelName = "ggml-base.en";
const modelFile = `${modelName}.bin`;

const modelSha256 =
  "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";

/** The decoding of the clip to the WAV whisper reads: 16 kHz, mono, signed 16-bit. */
const resampleArgs = ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"] as const;

const whisperArgs = ["-ml", "1", "-sow", "-oj", "-np", "-t", "4"] as const;

/** The model file and the binary; `TSUKURI_WHISPER_BIN` defaults to `whisper-cli` on the `PATH`. */
export const whisperConfig = Config.all({
  bin: Config.String("TSUKURI_WHISPER_BIN").pipe(
    Config.withDefault("whisper-cli")
  ),
  model: Config.String("TSUKURI_WHISPER_MODEL"),
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
export const heardWords = (json: string) =>
  Effect.map(
    Effect.mapError(
      decodeOutput(json),
      alignFailure("whisper wrote JSON of an unexpected shape")
    ),
    ({ transcription }) =>
      Arr.flatMap(transcription, ({ offsets, text }): readonly HeardWord[] =>
        Str.trim(text) === ""
          ? []
          : [{ endMs: offsets.to, startMs: offsets.from, w: Str.trim(text) }]
      )
  );

/** The `ffmpeg` arguments that turn raw s16 mono samples at `rate` Hz into the WAV whisper reads. */
export const resampleCommand = (
  input: string,
  rate: number,
  wav: string
): readonly string[] => [
  "-nostdin",
  "-v",
  "error",
  "-y",
  "-f",
  "s16le",
  "-ar",
  String(rate),
  "-ac",
  "1",
  "-i",
  input,
  ...resampleArgs,
  wav,
];

/** The `whisper-cli` arguments: the model, the WAV, one JSON entry per word, written to `<base>.json`. */
export const whisperCommand = (
  model: string,
  wav: string,
  base: string
): readonly string[] => ["-m", model, "-f", wav, ...whisperArgs, "-of", base];

/** The clip as raw signed 16-bit little-endian samples: round(sample * 32768), clamped. */
export const s16Bytes = (samples: Float32Array): Uint8Array => {
  const pcm = Int16Array.from(samples, (sample) =>
    Math.max(-32_768, Math.min(32_767, Math.round(sample * 32_768)))
  );

  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
};

/** `WordAligner` through `whisper-cli` and the `ffmpeg` on the `PATH` (or `TSUKURI_WHISPER_BIN`). */
export const whisperAligner = Layer.effect(
  WordAligner,
  Effect.gen(function* whisperAlignerLayer() {
    const configured = yield* Effect.result(whisperConfig);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const digest = yield* Digest.Digest;

    const fail = alignFailure("cannot move audio through a temporary file");

    const pinned = Effect.gen(function* pinnedWhisper() {
      const { bin, model } = yield* Effect.mapError(
        Effect.fromResult(configured),
        () =>
          unavailable(
            "env TSUKURI_WHISPER_MODEL",
            "TSUKURI_WHISPER_MODEL names the whisper model file and is not set"
          )
      );

      yield* Effect.mapError(runTool(spawner, "ffmpeg", ["-version"]), () =>
        unavailable("binary ffmpeg", "cannot run ffmpeg")
      );

      const banner = yield* Effect.mapError(
        runTool(spawner, bin, ["--version"]),
        () => unavailable("binary whisper-cli", `cannot run ${bin}`)
      );

      const version = /whisper\.cpp version: (?<version>\S+)/u.exec(banner)
        ?.groups?.version;

      if (version !== whisperCpp) {
        return yield* unavailable(
          `whisper.cpp ${whisperCpp}`,
          `${bin} is whisper.cpp ${version ?? "of unknown version"}, the cache keys name ${whisperCpp}`
        );
      }

      const bytes = yield* Effect.mapError(fs.readFile(model), () =>
        unavailable(`model ${modelFile}`, `cannot read the model ${model}`)
      );

      const sha256 = yield* digest.digestHex(Digest.sha256, bytes);

      if (sha256 !== modelSha256) {
        return yield* unavailable(
          `model ${modelFile} with SHA-256 ${modelSha256}`,
          `${model} has SHA-256 ${sha256}, the cache keys name ${modelSha256}`
        );
      }

      return { bin, model };
    });

    const verified = yield* Effect.cached(pinned);

    const align = Effect.fn("WordAligner.align")(function* align(
      request: AlignRequest
    ) {
      const { bin, model } = yield* verified;
      const { clip, words } = request;

      const durationMs = Math.round(
        (clip.samples.length * 1000) / clip.sampleRate
      );

      const directory = yield* Effect.mapError(
        fs.makeTempDirectoryScoped({ prefix: "tsukuri-whisper-" }),
        fail
      );

      const input = path.join(directory, "in.s16");
      const wav = path.join(directory, "in.wav");
      const base = path.join(directory, "words");

      yield* Effect.mapError(fs.writeFile(input, s16Bytes(clip.samples)), fail);
      yield* runTool(
        spawner,
        "ffmpeg",
        resampleCommand(input, clip.sampleRate, wav)
      );
      yield* runTool(spawner, bin, whisperCommand(model, wav, base));

      const heard = yield* Effect.flatMap(
        Effect.mapError(fs.readFileString(`${base}.json`), fail),
        heardWords
      );

      const aligned = alignWords(words, heard, durationMs);

      return { match: aligned.match, spans: aligned.words };
    }, Effect.scoped);

    return WordAligner.of({
      align,
      info: {
        egress: localEgress,
        id: adapterId,
        settings: {
          model: modelName,
          modelSha256,
          resample: Arr.join(resampleArgs, " "),
          whisperArgs: Arr.join(whisperArgs, " "),
        },
      },
    });
  })
);

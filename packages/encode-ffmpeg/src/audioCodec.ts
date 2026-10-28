// Lossless audio on ffmpeg: float mono samples become FLAC (s16, level 8, bit-exact so the bytes do not depend on
// the ffmpeg build's encoder tag) and back. The file the cache stores is what `encodeFlac` returns; the decoded
// samples are what a FLAC held, as float: `s16 / 32768`.
import type { AudioClip } from "@reebeat/services";
import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";

import { MediaToolFailed } from "./errors.ts";
import { MediaTools } from "./mediaTools.ts";
import { probeMedia } from "./probe.ts";
import { flacArgs } from "./settings.ts";

/** The services every codec step uses, and a temporary directory that the caller's scope removes. */
const scratch = Effect.gen(function* scratch() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tools = yield* MediaTools;

  const directory = yield* fs.makeTempDirectoryScoped({
    prefix: "reebeat-flac-",
  });

  return { directory, fs, path, tools };
});

/** The clip as FLAC bytes: s16, mono, the clip's own sample rate. */
export const encodeFlac = Effect.fn("encodeFlac")(function* encodeFlac(
  clip: AudioClip
) {
  const { directory, fs, path, tools } = yield* scratch;

  const input = path.join(directory, "in.f32");
  const output = path.join(directory, "out.flac");

  yield* fs.writeFile(
    input,
    new Uint8Array(
      clip.samples.buffer,
      clip.samples.byteOffset,
      clip.samples.byteLength
    )
  );
  yield* tools.run("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(clip.sampleRate),
    "-ac",
    "1",
    "-i",
    input,
    ...flacArgs,
    output,
  ]);

  return yield* fs.readFile(output);
}, Effect.scoped);

/** The FLAC bytes as a mono float clip at the file's own sample rate. */
export const decodeFlac = Effect.fn("decodeFlac")(function* decodeFlac(
  bytes: Uint8Array
) {
  const { directory, fs, path, tools } = yield* scratch;

  const input = path.join(directory, "in.flac");

  yield* fs.writeFile(input, bytes);

  const media = yield* probeMedia(input);

  const rate = Arr.findFirst(
    media.streams,
    (stream) => stream.codec_type === "audio"
  ).pipe(Option.flatMapNullishOr((stream) => stream.sample_rate));

  if (Option.isNone(rate)) {
    return yield* new MediaToolFailed({
      cause: undefined,
      message: "the decoded file has no audio stream with a sample rate",
      stderr: "",
      tool: "ffprobe",
    });
  }

  const raw = yield* tools.run("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-f",
    "f32le",
    "pipe:1",
  ]);

  return {
    sampleRate: rate.value,
    samples: new Float32Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    ),
  } satisfies AudioClip;
}, Effect.scoped);

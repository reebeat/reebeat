// The fixed speech pipeline of spec 0001 ("M0 measured: speech") and the facts it was measured with. Every
// value here is part of the cache key (`key.ts`), so changing one invalidates the cache entries it made.
// The arguments of ffmpeg are written once as arrays; the key's `ffmpegFlags` text is derived from the same
// arrays, so the flags a run uses and the flags the key names cannot drift apart.
// Change `whisperArgs` or any other behaviour that is not named in the key: bump `version`.

import { Array as Arr } from "effect";

const flacArgs = [
  "-sample_fmt",
  "s16",
  "-c:a",
  "flac",
  "-compression_level",
  "8",
  "-fflags",
  "+bitexact",
  "-flags:a",
  "+bitexact",
] as const;

const resampleArgs = ["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"] as const;

export const pipeline = {
  dtype: "fp32",
  /** Kokoro WAV (float32, 24 kHz, mono) to FLAC s16, level 8: the audio the cache stores. */
  flacArgs,
  /** The version of kokoro-js in the root catalog (a test checks it). */
  kokoroJs: "1.2.1",
  /** Decoding of THAT FLAC to the 16 kHz mono s16 WAV whisper reads. */
  resampleArgs,
  ttsModel: "onnx-community/Kokoro-82M-v1.0-ONNX",
  /** The sample rate Kokoro produces. */
  ttsSampleRate: 24_000,
  /** Bump when a behaviour changes that no other key field names (whisper arguments, alignment rules). */
  version: 1,
  voice: "af_heart",
  whisperArgs: ["-ml", "1", "-sow", "-oj", "-np", "-t", "4"],
  /** The output of `whisper-cli --version` after `whisper.cpp version: `. */
  whisperCpp: "1.9.5-dev",
  whisperModelSha256:
    "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
} as const;

/** The two ffmpeg argument lists as one text, the key's `ffmpegFlags`. */
export const ffmpegFlags = `flac: ${Arr.join(flacArgs, " ")} | resample: ${Arr.join(resampleArgs, " ")}`;

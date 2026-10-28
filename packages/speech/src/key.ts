// The content address of one narrated Line (spec 0001, "Speech"): SHA-256 over the canonical JSON of everything
// that decides the audio and its word times. The Schema declares its fields in alphabetical order, so equal
// parameters encode to equal text. The digest comes from Effect's `Crypto` service.
import { Crypto, Effect, Schema } from "effect";
import type { PlatformError } from "effect";
import { Hex } from "effect/encoding";

import { ffmpegFlags, pipeline } from "./pipeline.ts";

export const SpeechParamsSchema = Schema.Struct({
  dtype: Schema.String,
  ffmpegFlags: Schema.String,
  kokoroJs: Schema.String,
  pipelineVersion: Schema.Int,
  speed: Schema.Finite,
  text: Schema.String,
  ttsModel: Schema.String,
  voice: Schema.String,
  whisperCpp: Schema.String,
  whisperModelSha256: Schema.String,
});

export type SpeechParams = typeof SpeechParamsSchema.Type;

/** The parameters of a Line's narration: its text and speed, with the fixed pipeline. */
export const speechParams = (line: {
  readonly speed: number;
  readonly text: string;
}): SpeechParams => ({
  dtype: pipeline.dtype,
  ffmpegFlags,
  kokoroJs: pipeline.kokoroJs,
  pipelineVersion: pipeline.version,
  speed: line.speed,
  text: line.text,
  ttsModel: pipeline.ttsModel,
  voice: pipeline.voice,
  whisperCpp: pipeline.whisperCpp,
  whisperModelSha256: pipeline.whisperModelSha256,
});

const canonicalJson = Schema.fromJsonString(SpeechParamsSchema);
const encodeCanonical = Schema.encodeEffect(canonicalJson);

/** The SHA-256 of `bytes` as lower-case hex, through the platform `Crypto` service. */
export const sha256Hex = Effect.fnUntraced(function* sha256Hex(
  bytes: Uint8Array
): Effect.fn.Return<string, PlatformError.PlatformError, Crypto.Crypto> {
  const crypto = yield* Crypto.Crypto;

  return Hex.encode(yield* crypto.digest("SHA-256", bytes));
});

/** The cache key of `params`: SHA-256 of their canonical JSON, as lower-case hex. */
export const speechKey = Effect.fnUntraced(function* speechKey(
  params: SpeechParams
): Effect.fn.Return<string, PlatformError.PlatformError, Crypto.Crypto> {
  const text = yield* Effect.orDie(encodeCanonical(params));

  return yield* sha256Hex(new TextEncoder().encode(text));
});

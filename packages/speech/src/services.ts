import type { PlanJson, AlignedLine } from "@reebeat/core";
// The capabilities of the speech stage (spec 0001, "Module layout"). Each is a service because it stands for a
// model, a child process or a directory; the plain functions (`alignWords`, `speechKey`) need none.
// Implementations: `kokoro.ts` (Tts), `ffmpeg.ts` (Flac), `whisper.ts` (Aligner), `cache.ts` (SpeechCache),
// `speech.ts` (Speech).
import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { HeardWord } from "./align.ts";
import type { CacheEntry } from "./entry.ts";
import type {
  SpeechCacheFailed,
  SpeechError,
  SpeechToolFailed,
} from "./errors.ts";

/** Text to speech: mono samples at `pipeline.ttsSampleRate`. */
export class Tts extends Context.Service<
  Tts,
  {
    readonly synthesize: (request: {
      readonly speed: number;
      readonly text: string;
    }) => Effect.Effect<Float32Array, SpeechToolFailed>;
  }
>()("@reebeat/speech/Tts") {}

/** The cache's audio format: samples to FLAC s16 mono at the synthesis rate. */
export class Flac extends Context.Service<
  Flac,
  {
    readonly encode: (
      samples: Float32Array
    ) => Effect.Effect<Uint8Array, SpeechToolFailed>;
  }
>()("@reebeat/speech/Flac") {}

/** Speech to words: what whisper hears in cached audio, with times, the empty first segment dropped. */
export class Aligner extends Context.Service<
  Aligner,
  {
    readonly align: (
      flac: Uint8Array
    ) => Effect.Effect<readonly HeardWord[], SpeechToolFailed>;
  }
>()("@reebeat/speech/Aligner") {}

/** The content-addressed store of narrated Lines. */
export class SpeechCache extends Context.Service<
  SpeechCache,
  {
    /** The entry of `key`, its audio verified against `audioSha256`; none when absent. */
    readonly get: (
      key: string
    ) => Effect.Effect<Option.Option<CacheEntry>, SpeechCacheFailed>;
    /** Stores the audio first and the words file last, so an entry is visible only when whole. */
    readonly put: (
      entry: CacheEntry,
      flac: Uint8Array
    ) => Effect.Effect<void, SpeechCacheFailed>;
  }
>()("@reebeat/speech/SpeechCache") {}

/** The narration of a Plan: one aligned Line for every Line of every Scene, in order. */
export class Speech extends Context.Service<
  Speech,
  {
    readonly alignLines: (
      plan: PlanJson
    ) => Effect.Effect<readonly AlignedLine[], SpeechError>;
  }
>()("@reebeat/speech/Speech") {}

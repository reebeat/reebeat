import type { Line, PlanJson } from "@reebeat/core";
// `Speech.alignLines`: for each Line of the Plan, in order, one at a time: key, cache lookup, and on a miss
// either the typed `SpeechCacheMiss` (`speechCacheOnly`, which loads no model) or the live pipeline
// (`speechLive`: Kokoro -> FLAC -> whisper -> alignment, then the cache is filled).
import { Array as Arr, Crypto, Effect, Layer, Option } from "effect";

import { alignWords, matchThreshold } from "./align.ts";
import { speechCacheFiles } from "./cache.ts";
import { toAlignedLine } from "./entry.ts";
import type { CacheEntry } from "./entry.ts";
import {
  AlignmentBelowThreshold,
  SpeechCacheMiss,
  SpeechToolFailed,
} from "./errors.ts";
import type { SpeechError } from "./errors.ts";
import { flacFfmpeg } from "./ffmpeg.ts";
import { sha256Hex, speechKey, speechParams } from "./key.ts";
import type { SpeechParams } from "./key.ts";
import { ttsKokoro } from "./kokoro.ts";
import { pipeline } from "./pipeline.ts";
import { Aligner, Flac, Speech, SpeechCache, Tts } from "./services.ts";
import { alignerWhisper } from "./whisper.ts";

/** A Line with no cache entry. */
interface Miss {
  readonly key: string;
  readonly line: Line;
  readonly params: SpeechParams;
}

const excerpt = (text: string): string =>
  text.length <= 48 ? text : `${text.slice(0, 45)}...`;

/** Builds `alignLines` from the cache and what to do when it has no entry. */
const makeSpeech = (
  cache: SpeechCache["Service"],
  crypto: Crypto.Crypto,
  onMiss: (miss: Miss) => Effect.Effect<CacheEntry, SpeechError>
) =>
  Speech.of({
    alignLines: Effect.fn("Speech.alignLines")(function* alignLines(
      plan: PlanJson
    ) {
      const lines = Arr.flatMap(plan.scenes, (scene) => scene.lines);

      return yield* Effect.forEach(lines, (line) =>
        Effect.gen(function* alignLine() {
          const params = speechParams({
            speed: line.hints.speed,
            text: line.text,
          });

          const key = yield* Effect.mapError(
            Effect.provideService(speechKey(params), Crypto.Crypto, crypto),
            (cause) =>
              new SpeechToolFailed({
                cause,
                message: `cannot hash the parameters of Line ${line.id}`,
                tool: "sha256",
              })
          );

          const cached = yield* cache.get(key);

          const entry = Option.isSome(cached)
            ? cached.value
            : yield* onMiss({ key, line, params });

          return toAlignedLine(line.id, entry);
        })
      );
    }),
  });

/** The narration from the cache only: a Line with no entry fails `SpeechCacheMiss`; no model is ever loaded. */
const cacheOnly = Layer.effect(
  Speech,
  Effect.gen(function* cacheOnlyLayer() {
    const cache = yield* SpeechCache;
    const crypto = yield* Crypto.Crypto;

    return makeSpeech(cache, crypto, ({ key, line }) =>
      Effect.fail(
        new SpeechCacheMiss({
          key,
          lineId: line.id,
          message: `the speech cache has no entry ${key} for Line ${line.id} ("${excerpt(line.text)}"); refill it with the models present`,
          textExcerpt: excerpt(line.text),
        })
      )
    );
  })
);

/** The narration that fills the cache on a miss, from the Tts, Flac and Aligner services. */
export const speechFromServices = Layer.effect(
  Speech,
  Effect.gen(function* speechFromServicesLayer() {
    const cache = yield* SpeechCache;
    const crypto = yield* Crypto.Crypto;
    const tts = yield* Tts;
    const flac = yield* Flac;
    const aligner = yield* Aligner;

    const narrate = Effect.fn("Speech.narrate")(function* narrate({
      key,
      line,
      params,
    }: Miss) {
      yield* Effect.logInfo(`narrating ${line.id}: ${excerpt(line.text)}`);

      const samples = yield* tts.synthesize({
        speed: line.hints.speed,
        text: line.text,
      });

      const audio = yield* flac.encode(samples);
      const heard = yield* aligner.align(audio);

      const durationMs = Math.round(
        (samples.length * 1000) / pipeline.ttsSampleRate
      );

      const { match, words } = alignWords(line.words, heard, durationMs);

      if (match < matchThreshold) {
        return yield* new AlignmentBelowThreshold({
          lineId: line.id,
          match,
          message: `whisper heard "${Arr.join(
            Arr.map(heard, (word) => word.w),
            " "
          )}" for Line ${line.id} ("${line.text}"): match ${match.toFixed(3)} is below ${matchThreshold}`,
          threshold: matchThreshold,
        });
      }

      const audioSha256 = yield* Effect.mapError(
        Effect.provideService(sha256Hex(audio), Crypto.Crypto, crypto),
        (cause) =>
          new SpeechToolFailed({
            cause,
            message: `cannot hash the audio of Line ${line.id}`,
            tool: "sha256",
          })
      );

      const entry: CacheEntry = {
        audioSha256,
        durationMs,
        key,
        match,
        params,
        words: Arr.map(words, (span, index) => ({
          endMs: span.endMs,
          startMs: span.startMs,
          w: line.words[index] ?? "",
        })),
      };

      yield* cache.put(entry, audio);

      return entry;
    });

    return makeSpeech(cache, crypto, narrate);
  })
);

/** Narration from the cache in `cacheDir` alone (needs only the platform file system and `Crypto`). */
export const speechCacheOnly = (cacheDir: string) =>
  cacheOnly.pipe(Layer.provide(speechCacheFiles(cacheDir)));

/**
 * Narration that fills the cache in `cacheDir` from the local models (needs the platform file system, process
 * spawner and `Crypto`; Config `REEBEAT_KOKORO_CACHE`, `REEBEAT_WHISPER_MODEL`, `REEBEAT_WHISPER_BIN`).
 */
export const speechLive = (cacheDir: string) =>
  speechFromServices.pipe(
    Layer.provide(
      Layer.mergeAll(
        speechCacheFiles(cacheDir),
        ttsKokoro,
        flacFfmpeg,
        alignerWhisper
      )
    )
  );

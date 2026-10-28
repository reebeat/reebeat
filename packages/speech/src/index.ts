// Public surface of @reebeat/speech: the narration of a Plan, from the content-addressed speech cache or from
// the local models that fill it (spec 0001, "Speech").
export { alignWords, matchThreshold, normaliseWord } from "./align.ts";

export type { Alignment, HeardWord, WordSpan } from "./align.ts";

export { CacheEntrySchema, audioFile, entryFile } from "./entry.ts";

export type { CacheEntry } from "./entry.ts";

export * from "./errors.ts";

export {
  SpeechParamsSchema,
  sha256Hex,
  speechKey,
  speechParams,
} from "./key.ts";

export type { SpeechParams } from "./key.ts";

export { pipeline } from "./pipeline.ts";

export { Aligner, Flac, Speech, SpeechCache, Tts } from "./services.ts";

export { speechCacheFiles } from "./cache.ts";

export { speechCacheOnly, speechFromServices, speechLive } from "./speech.ts";

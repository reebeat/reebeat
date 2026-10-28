import type { AlignedLine } from "@reebeat/core";
// One cache entry (`<cacheDir>/<key>.json`; its audio is `<cacheDir>/<key>.flac`). The fields are declared in
// alphabetical order, so an entry always encodes to the same text. Entries are read through this Schema like
// any other external input: the cache is a file a human may have edited or truncated.
import { Schema } from "effect";

import { SpeechParamsSchema } from "./key.ts";

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const CacheEntrySchema = Schema.Struct({
  /** SHA-256 of the FLAC bytes. */
  audioSha256: Schema.String,
  durationMs: Milliseconds,
  key: Schema.String,
  /** The Dice ratio of the alignment, at least `matchThreshold`. */
  match: Schema.Finite,
  params: SpeechParamsSchema,
  words: Schema.Array(
    Schema.Struct({
      endMs: Milliseconds,
      startMs: Milliseconds,
      w: Schema.String,
    })
  ),
});

export type CacheEntry = typeof CacheEntrySchema.Type;

const entryJson = Schema.fromJsonString(CacheEntrySchema, { space: 2 });

/** Decodes the text of an entry file. */
export const decodeEntry = Schema.decodeUnknownEffect(entryJson);

/** Encodes an entry as the text of its file (two-space indent, no trailing newline). */
export const encodeEntry = Schema.encodeEffect(entryJson);

/** The name of an entry's audio file, relative to the cache directory. */
export const audioFile = (key: string): string => `${key}.flac`;

/** The name of an entry's words file, relative to the cache directory. */
export const entryFile = (key: string): string => `${key}.json`;

/** What `schedule` needs of a Line, from its cache entry. */
export const toAlignedLine = (
  lineId: string,
  entry: CacheEntry
): AlignedLine => ({
  audio: { file: audioFile(entry.key), sha256: entry.audioSha256 },
  durationMs: entry.durationMs,
  lineId,
  words: entry.words,
});

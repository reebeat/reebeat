// The cached asset of one narrated Line (design R3): two files, `flac` (the narration, s16 mono) and `words.json`
// (its duration and the aligned time of every word). The cache stores them as `<key>.flac` and `<key>.words.json`.
// The words file is read through its Schema like any external input: the cache is a directory a human may edit.
import type { AlignedLine } from "@tsukuri/core";
import { Schema } from "effect";

/** The file name of the narration audio inside an asset; the cache prefixes the key: `<key>.flac`. */
export const audioName = "flac";

/** The file name of the words file inside an asset. */
export const wordsName = "words.json";

const Milliseconds = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const WordsFileSchema = Schema.Struct({
  durationMs: Milliseconds,
  /** The match ratio of the alignment, at least `matchThreshold`. */
  match: Schema.Finite,
  words: Schema.Array(
    Schema.Struct({
      endMs: Milliseconds,
      startMs: Milliseconds,
      w: Schema.String,
    })
  ),
});

export type WordsFile = typeof WordsFileSchema.Type;

const wordsJson = Schema.fromJsonString(WordsFileSchema, { space: 2 });

/** Decodes the text of a words file. */
export const decodeWords = Schema.decodeUnknownEffect(wordsJson);

/** Encodes a words file as text (two-space indent, no trailing newline). */
export const encodeWords = Schema.encodeEffect(wordsJson);

/** What `schedule` needs of a Line (`lineId`: where it is, `lineIdOf`), from its words file and the hash of its audio. */
export const toAlignedLine = (
  lineId: string,
  key: string,
  audioSha256: string,
  words: WordsFile
): AlignedLine => ({
  audio: { file: `${key}.${audioName}`, sha256: audioSha256 },
  durationMs: words.durationMs,
  lineId,
  words: words.words,
});

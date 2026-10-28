import { Schema } from "effect";

// Every expected failure of the speech stage says which Line or key it concerns and what is wrong.

/** The cache holds no entry for a Line's key and no model may be loaded to make one. */
export class SpeechCacheMiss extends Schema.TaggedError<
  SpeechCacheMiss,
  { readonly brand: unique symbol }
>()("SpeechCacheMiss", {
  key: Schema.String,
  lineId: Schema.String,
  message: Schema.String,
  /** The start of the narration text, for the human who reads the error. */
  textExcerpt: Schema.String,
}) {}

/** Whisper heard too little of what the narrator was asked to say: the words cannot be trusted as timings. */
export class AlignmentBelowThreshold extends Schema.TaggedError<
  AlignmentBelowThreshold,
  { readonly brand: unique symbol }
>()("AlignmentBelowThreshold", {
  lineId: Schema.String,
  match: Schema.Finite,
  message: Schema.String,
  threshold: Schema.Finite,
}) {}

/** A cache entry exists but cannot be read, verified or written. */
export class SpeechCacheFailed extends Schema.TaggedError<
  SpeechCacheFailed,
  { readonly brand: unique symbol }
>()("SpeechCacheFailed", {
  cause: Schema.Defect(),
  key: Schema.String,
  message: Schema.String,
  operation: Schema.Literals(["read", "verify", "write"]),
}) {}

/** A model, a child process or the hash service failed or answered something unexpected. */
export class SpeechToolFailed extends Schema.TaggedError<
  SpeechToolFailed,
  { readonly brand: unique symbol }
>()("SpeechToolFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  tool: Schema.Literals(["ffmpeg", "kokoro", "sha256", "whisper"]),
}) {}

/** Everything `Speech.alignLines` can fail with. */
export type SpeechError =
  | SpeechCacheMiss
  | AlignmentBelowThreshold
  | SpeechCacheFailed
  | SpeechToolFailed;

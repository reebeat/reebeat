// The expected failures of the speech stage. Each says which Line or key it concerns and what is wrong. Failures of
// the services the stage uses (a synthesiser, an aligner, the encoder, the cache) pass through with their own types.
import { Schema } from "effect";

/** The cache holds no asset for a Line's key and the stage was not asked to refresh it. */
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

/** The aligner heard too little of what the narrator was asked to say: the words cannot be trusted as timings. */
export class AlignmentBelowThreshold extends Schema.TaggedError<
  AlignmentBelowThreshold,
  { readonly brand: unique symbol }
>()("AlignmentBelowThreshold", {
  lineId: Schema.String,
  match: Schema.Finite,
  message: Schema.String,
  threshold: Schema.Finite,
}) {}

/** A cached asset exists but is not what the stage wrote: a file is missing or the words file is not valid. */
export class SpeechAssetInvalid extends Schema.TaggedError<
  SpeechAssetInvalid,
  { readonly brand: unique symbol }
>()("SpeechAssetInvalid", {
  cause: Schema.Defect(),
  key: Schema.String,
  lineId: Schema.String,
  message: Schema.String,
}) {}

/** Everything the speech stage itself adds to the failures of the services it uses. */
export type SpeechStageError =
  | SpeechCacheMiss
  | AlignmentBelowThreshold
  | SpeechAssetInvalid;

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

/** The `.fountain` file cannot be read or is not valid UTF-8. */
export class SourceUnreadable extends Schema.TaggedError<
  SourceUnreadable,
  { readonly brand: unique symbol }
>()("SourceUnreadable", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** The output directory is neither empty nor an earlier build, so the build will not replace it. */
export class OutputDirOccupied extends Schema.TaggedError<
  OutputDirOccupied,
  { readonly brand: unique symbol }
>()("OutputDirOccupied", { message: Schema.String, path: Schema.String }) {}

/** Writing, moving or removing a file of the build failed. */
export class BuildOutputFailed extends Schema.TaggedError<
  BuildOutputFailed,
  { readonly brand: unique symbol }
>()("BuildOutputFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** The `cause` handler of an effect that writes, moves or removes `path`: `what` completes "cannot ...". */
export const outputFailed = (path: string, what: string) => (cause: unknown) =>
  new BuildOutputFailed({
    cause,
    message: `cannot ${what} ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
    path,
  });

/** The cache holds an asset the Plan's Line names, but `build.json` cannot record it: it is missing from `list`. */
export class AssetNotListed extends Schema.TaggedError<
  AssetNotListed,
  { readonly brand: unique symbol }
>()("AssetNotListed", {
  key: Schema.String,
  lineId: Schema.String,
  message: Schema.String,
}) {}

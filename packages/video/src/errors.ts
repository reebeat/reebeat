// The expected failures of the video stage. Each names what a caller can act on; a foreign cause stays in `cause`.
import { Schema } from "effect";

/** The Plan has no Timeline, or its Timeline names a Scene, Line or Cue the Plan does not have. */
export class PlanNotScheduled extends Schema.TaggedError<
  PlanNotScheduled,
  { readonly brand: unique symbol }
>()("PlanNotScheduled", { message: Schema.String }) {}

/** ffmpeg or ffprobe could not start, or exited with a code other than 0; `stderr` is the end of its error output and `cause` is undefined when the tool ran. */
export class MediaToolFailed extends Schema.TaggedError<
  MediaToolFailed,
  { readonly brand: unique symbol }
>()("MediaToolFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  stderr: Schema.String,
  tool: Schema.String,
}) {}

/** Writing, moving or removing an output file failed. */
export class OutputFailed extends Schema.TaggedError<
  OutputFailed,
  { readonly brand: unique symbol }
>()("OutputFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  path: Schema.String,
}) {}

/** The output name is not a plain file stem, so `<name>.mp4` could land outside the output directory. */
export class InvalidOutputName extends Schema.TaggedError<
  InvalidOutputName,
  { readonly brand: unique symbol }
>()("InvalidOutputName", { message: Schema.String, stem: Schema.String }) {}

/** An `sfx` Cue names a sound the catalogue does not have: the audio track would silently lack it. */
export class UnknownSfx extends Schema.TaggedError<
  UnknownSfx,
  { readonly brand: unique symbol }
>()("UnknownSfx", {
  cueId: Schema.String,
  message: Schema.String,
  sound: Schema.NullOr(Schema.String),
}) {}

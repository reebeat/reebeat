// The expected failures of the ffmpeg adapter's own helpers. The Encoder's methods fail with the services' typed
// errors (`EncodeFailed`, `AdapterUnavailable`); these two are the helpers' (`MediaTools`, the probes, the name check).
import { Schema } from "effect";

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

/** The output name is not a plain file stem, so `<name>` could land outside the output directory. */
export class InvalidOutputName extends Schema.TaggedError<
  InvalidOutputName,
  { readonly brand: unique symbol }
>()("InvalidOutputName", { message: Schema.String, stem: Schema.String }) {}

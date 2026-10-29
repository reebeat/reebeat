// The expected failures of the ffmpeg adapter's own helpers. The Encoder's methods fail with the services' typed
// errors (`EncodeFailed`, `AdapterUnavailable`); `MediaToolFailed` is the helpers' (`MediaTools`, the probes).
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

// The expected failures of the video stage. Each names what a caller can act on; a foreign cause stays in `cause`.
import { Schema } from "effect";

/** The Plan has no Timeline, or its Timeline names a Scene, Line or Cue the Plan does not have. */
export class PlanNotScheduled extends Schema.TaggedError<
  PlanNotScheduled,
  { readonly brand: unique symbol }
>()("PlanNotScheduled", { message: Schema.String }) {}

/** Chromium or Playwright failed: launching, loading the deck page, running a command, taking a screenshot. */
export class BrowserFailed extends Schema.TaggedError<
  BrowserFailed,
  { readonly brand: unique symbol }
>()("BrowserFailed", {
  cause: Schema.Defect(),
  message: Schema.String,
  operation: Schema.String,
}) {}

/** The capture ran past its deadline (spec 0001, F12); the build writes no output. */
export class CaptureTimeout extends Schema.TaggedError<
  CaptureTimeout,
  { readonly brand: unique symbol }
>()("CaptureTimeout", {
  frames: Schema.Int,
  message: Schema.String,
  seconds: Schema.Finite,
}) {}

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

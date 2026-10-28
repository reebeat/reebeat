// The expected failures inside the capture. Each names what a caller can act on; a foreign cause stays in `cause`.
// The FrameCapturer maps both to the service's one `CaptureError` at its boundary (`chromium.ts`).
import { Schema } from "effect";

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

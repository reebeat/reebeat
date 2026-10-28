// Public surface of @reebeat/capture-chromium: the `FrameCapturer` adapter `chromiumCapturer`, and the pure and
// lower-level parts behind it: the capture schedule, the capture under the controlled clock, the browser layer.
export { Browser } from "./browser.ts";

export type { BrowserVersions, DeckPage, OpenOptions } from "./browser.ts";

export {
  captureFrames,
  clockOrigin,
  defaultTimeoutSeconds,
} from "./capture.ts";

export type { CaptureOptions } from "./capture.ts";

export { captureSchedule, sceneChangeLag } from "./captureSchedule.ts";

export type {
  CaptureCommand,
  CaptureSchedule,
  ScheduledCommand,
} from "./captureSchedule.ts";

export { chromiumCapturer, chromiumCapturerWith } from "./chromium.ts";

export type { ChromiumOptions } from "./chromium.ts";

export * from "./errors.ts";

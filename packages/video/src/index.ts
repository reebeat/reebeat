// Public surface of @reebeat/video: the pure derivations of a scheduled Plan (subtitles, chapters, audio mix,
// capture schedule), the capture under the controlled clock, the mux, and the probes that observe the written file.
export { audioMixPlan, sampleRateHz } from "./audioMix.ts";

export type { AudioInput, AudioMixPlan } from "./audioMix.ts";

export { Browser } from "./browser.ts";

export type { DeckPage, OpenOptions } from "./browser.ts";

export {
  captureFrames,
  clockOrigin,
  defaultTimeoutSeconds,
} from "./capture.ts";

export type { CaptureOptions } from "./capture.ts";

export {
  autoAnimateLag,
  captureSchedule,
  sceneChangeLag,
} from "./captureSchedule.ts";

export type {
  CaptureCommand,
  CaptureSchedule,
  ScheduledCommand,
} from "./captureSchedule.ts";

export * from "./errors.ts";

export { ffmetadata } from "./ffmetadata.ts";

export { MediaTools } from "./mediaTools.ts";

export { muxArgs, muxVideo } from "./mux.ts";

export type { MuxOptions, MuxPaths, MuxResult } from "./mux.ts";

export { requireTimeline } from "./timedPlan.ts";

export type { TimedPlan } from "./timedPlan.ts";

export { vtt } from "./vtt.ts";

export * from "./probe.ts";

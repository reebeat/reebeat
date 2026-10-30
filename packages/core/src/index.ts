// Public surface of @tsukuri/core: Fountain source to Plan, Plan plus aligned words to Timeline, Plan to review
// text. Pure: no browser, no ffmpeg, no reveal.js, no Node built-in (spec 0001, F11).
export { alignWords, matchThreshold, normaliseWord } from "./align.ts";

export type { Alignment, HeardWord, WordSpan } from "./align.ts";

export { buildPlan, collectErrors } from "./build.ts";

export { formatAnchor, formatEffect, parseEffectLine } from "./effects.ts";

export * from "./errors.ts";

export * from "./grammar.ts";

export * from "./plan.ts";

export { reviewText } from "./review.ts";

export type { ReviewOptions } from "./review.ts";

export { AlignedLineSchema, schedule } from "./schedule.ts";

export type { AlignedLine } from "./schedule.ts";

export { frameToMs, linesById, requireTimeline } from "./timed.ts";

export type { TimedPlan } from "./timed.ts";

export { audioClipToWav } from "./wav.ts";

export { eventKind, hasWindow, showEffectOf } from "./events.ts";

export type { EventKind } from "./events.ts";

export { commandOf, timeOfProgress } from "./resolve.ts";

export { soundsOf, stepsOf } from "./steps.ts";

export type { CarriedSound, Carrier, Step } from "./steps.ts";

export { findPhrase } from "./words.ts";

export { grammarDocument } from "./grammarDoc.ts";

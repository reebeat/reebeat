// Public surface of @reebeat/core: Fountain source to Plan, Plan plus aligned words to Timeline, Plan to review
// text. Pure: no browser, no ffmpeg, no reveal.js, no Node built-in (spec 0001, F11).
export { alignWords, matchThreshold, normaliseWord } from "./align.ts";

export type { Alignment, HeardWord, WordSpan } from "./align.ts";

export { buildPlan, collectErrors } from "./build.ts";

export * from "./errors.ts";

export * from "./plan.ts";

export { reviewText } from "./review.ts";

export type { ReviewOptions } from "./review.ts";

export { AlignedLineSchema, schedule } from "./schedule.ts";

export type { AlignedLine } from "./schedule.ts";

export { cuesById, frameToMs, linesById, requireTimeline } from "./timed.ts";

export type { TimedPlan } from "./timed.ts";

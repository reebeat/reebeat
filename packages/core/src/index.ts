// Public surface of @reebeat/core: Fountain source to Plan, Plan plus aligned words to Timeline, Plan to review
// text. Pure: no browser, no ffmpeg, no reveal.js, no Node built-in (spec 0001, F11).
export { buildPlan, collectErrors } from "./build.ts";

export * from "./errors.ts";

export * from "./plan.ts";

export { reviewText } from "./review.ts";

export type { ReviewOptions } from "./review.ts";

export { AlignedLineSchema, schedule } from "./schedule.ts";

export type { AlignedLine } from "./schedule.ts";

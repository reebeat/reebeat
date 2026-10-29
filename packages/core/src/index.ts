// Public surface of @reebeat/core: Fountain source to Plan, Plan plus aligned words to Timeline, Plan to review
// text. Pure: no browser, no ffmpeg, no reveal.js, no Node built-in (spec 0001, F11).
export { alignWords, matchThreshold, normaliseWord } from "./align.ts";

export type { Alignment, HeardWord, WordSpan } from "./align.ts";

export { buildPlan, collectErrors, fountainImporter, planOf } from "./build.ts";

export { validateGraph } from "./structure.ts";

export type { Declared, Known } from "./structure.ts";

export {
  GraphSchema,
  graphJsonSchema,
  graphSchemaId,
  graphVersion,
  jsonCodec,
} from "./graph.ts";

export type {
  ArtifactRenderer,
  Graph,
  GraphScene,
  ImportErrors,
  Importer,
  IrCodec,
} from "./graph.ts";

export { formatAnchor } from "./anchors.ts";

export {
  formatEffect,
  formatLet,
  formatTiming,
  parseEffectLine,
} from "./effects.ts";

export { anchorsOf, evaluator, refsOf, statesOf } from "./evaluate.ts";

export type { Evaluate, Sources } from "./evaluate.ts";

export { endsAfter, once } from "./combinators.ts";

export type { Event, Occurrence, Window } from "./combinators.ts";

export { formatEvent } from "./expr.ts";

export {
  machineWords,
  machines,
  progressKinds,
  stateEventNames,
  stateNames,
  subjectKinds,
  transitionNames,
  vocabulary,
} from "./machines.ts";

export type { Form, Machine } from "./machines.ts";

export { initialState } from "./events.ts";

export { occupancies, stateEvent, stateStart } from "./occupancy.ts";

export {
  flicksOfFrames,
  flicksOfMilliseconds,
  flicksOfSeconds,
  flicksPerSecond,
  framesOfFlicks,
  lifecycleFrames,
  rateOf,
} from "./time.ts";

export type { LifecycleFrames, Rate } from "./time.ts";

export * from "./errors.ts";

export * from "./grammar.ts";

export * from "./plan.ts";

export { reviewText } from "./review.ts";

export type { ReviewOptions } from "./review.ts";

export { AlignedLineSchema, schedule } from "./schedule.ts";

export type { AlignedLine } from "./schedule.ts";

export { frameToMs, requireTimeline } from "./timed.ts";

export { lineIdOf, placedLines, planLines, timedLines } from "./lines.ts";

export type { PlacedLine, PlacedTimedLine } from "./lines.ts";

export type { TimedPlan } from "./timed.ts";

export { audioClipToWav } from "./wav.ts";

export { eventKind, hasWindow, showEffectOf } from "./events.ts";

export type { EventKind } from "./events.ts";

export { commandOf, timeOfProgress } from "./resolve.ts";

export { soundsOf, stepsOf } from "./steps.ts";

export type { CarriedSound, Carrier, Step } from "./steps.ts";

export { findPhrase, wordsOf } from "./words.ts";

export { sceneIdsOfChapter } from "./lookup.ts";

export { grammarDocument } from "./grammarDoc.ts";

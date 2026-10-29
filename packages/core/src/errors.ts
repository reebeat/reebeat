import { Schema } from "effect";

// Every expected failure of the Plan stage names the 1-based source line it concerns and says what is wrong.
const located = { line: Schema.Int, message: Schema.String };

/** Dual dialogue, centred text, page breaks, lyrics, a character other than NARRATOR, and the like. */
export class UnsupportedElement extends Schema.TaggedError<
  UnsupportedElement,
  { readonly brand: unique symbol }
>()("UnsupportedElement", located) {}

/** A `[[...]]` whose kind is not `next`, `focus: id` or `sfx: name`. */
export class UnknownCue extends Schema.TaggedError<
  UnknownCue,
  { readonly brand: unique symbol }
>()("UnknownCue", located) {}

/** Two Elements of one Scene share an `#id`. */
export class DuplicateId extends Schema.TaggedError<
  DuplicateId,
  { readonly brand: unique symbol }
>()("DuplicateId", located) {}

/** An Element line without `#id`. */
export class MissingId extends Schema.TaggedError<
  MissingId,
  { readonly brand: unique symbol }
>()("MissingId", located) {}

/** `[[focus: id]]` names an id that is not an Element of its Scene. */
export class CueTargetMissing extends Schema.TaggedError<
  CueTargetMissing,
  { readonly brand: unique symbol }
>()("CueTargetMissing", located) {}

/** `[[next]]` in a Scene with no hidden Element left to reveal. */
export class NextWithNothingHidden extends Schema.TaggedError<
  NextWithNothingHidden,
  { readonly brand: unique symbol }
>()("NextWithNothingHidden", located) {}

/** A `hidden` Element that no `[[next]]` of its Scene reveals. */
export class HiddenNeverRevealed extends Schema.TaggedError<
  HiddenNeverRevealed,
  { readonly brand: unique symbol }
>()("HiddenNeverRevealed", located) {}

/** A Parenthetical other than `(slowly)`, `(quickly)` and `(pause N)`, or one with no dialogue after it. */
export class BadParenthetical extends Schema.TaggedError<
  BadParenthetical,
  { readonly brand: unique symbol }
>()("BadParenthetical", located) {}

/** `Speed:` or `(speed N)` with a value that is not a number from 0.5 to 2, or a second `Speed:` title key. */
export class BadSpeed extends Schema.TaggedError<
  BadSpeed,
  { readonly brand: unique symbol }
>()("BadSpeed", located) {}

/** A transition other than `> AUTO-ANIMATE` and `> CUT`, or one that does not lead into a Scene. */
export class BadTransition extends Schema.TaggedError<
  BadTransition,
  { readonly brand: unique symbol }
>()("BadTransition", located) {}

/** `[[sfx: name]]` with a name outside the built-in catalogue. */
export class UnknownSfx extends Schema.TaggedError<
  UnknownSfx,
  { readonly brand: unique symbol }
>()("UnknownSfx", located) {}

/** `*` or `_` in dialogue, so that narration, subtitle and notes text stay one string. */
export class EmphasisInDialogue extends Schema.TaggedError<
  EmphasisInDialogue,
  { readonly brand: unique symbol }
>()("EmphasisInDialogue", located) {}

/** The first Scene is not preceded by a `# Section`. */
export class SceneBeforeSection extends Schema.TaggedError<
  SceneBeforeSection,
  { readonly brand: unique symbol }
>()("SceneBeforeSection", located) {}

/** The source has no Scene. */
export class EmptyStory extends Schema.TaggedError<
  EmptyStory,
  { readonly brand: unique symbol }
>()("EmptyStory", located) {}

const planErrors = {
  BadParenthetical,
  BadSpeed,
  BadTransition,
  CueTargetMissing,
  DuplicateId,
  EmphasisInDialogue,
  EmptyStory,
  HiddenNeverRevealed,
  MissingId,
  NextWithNothingHidden,
  SceneBeforeSection,
  UnknownCue,
  UnknownSfx,
  UnsupportedElement,
} as const;

export type PlanErrorTag = keyof typeof planErrors;

/** Everything `buildPlan` can fail with. */
export type PlanError = InstanceType<(typeof planErrors)[PlanErrorTag]>;

/** Makes the Plan error with the given tag. */
export const planError = (
  tag: PlanErrorTag,
  line: number,
  message: string
): PlanError => new planErrors[tag]({ line, message });

/** A Line's aligned words do not match the Line. */
export class AlignmentMismatch extends Schema.TaggedError<
  AlignmentMismatch,
  { readonly brand: unique symbol }
>()("AlignmentMismatch", { lineId: Schema.String, message: Schema.String }) {}

/** `settings.sceneLead` is shorter than `settings.transition`: the first Line would start inside the transition. */
export class SceneLeadTooShort extends Schema.TaggedError<
  SceneLeadTooShort,
  { readonly brand: unique symbol }
>()("SceneLeadTooShort", {
  message: Schema.String,
  sceneLead: Schema.Finite,
  transition: Schema.Finite,
}) {}

/** A Cue follows a word the Line does not have. */
export class CueOutsideLine extends Schema.TaggedError<
  CueOutsideLine,
  { readonly brand: unique symbol }
>()("CueOutsideLine", { cueId: Schema.String, message: Schema.String }) {}

/** Everything `schedule` can fail with. */
export type ScheduleError =
  | AlignmentMismatch
  | SceneLeadTooShort
  | CueOutsideLine;

/** The Plan has no Timeline, or its Timeline names a Scene, Line or Cue the Plan does not have. */
export class PlanNotScheduled extends Schema.TaggedError<
  PlanNotScheduled,
  { readonly brand: unique symbol }
>()("PlanNotScheduled", { message: Schema.String }) {}

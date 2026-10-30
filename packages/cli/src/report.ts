// What a failure looks like on the terminal: the tag, the message and the source line when the error has one. No
// stack, no cause. A plain function over the structure every tagged error of the pipeline shares.
import type { PlanError, PlanErrorTag } from "@tsukuri/core";
import { Console, Effect, Predicate } from "effect";
import { CliError } from "effect/cli";

/** What every expected failure of the pipeline carries. */
interface Reportable {
  readonly _tag: string;
  readonly message: string;
}

// The errors that carry the 1-based line of the screenplay they concern. The record is exhaustive over the core's
// tags, so a new Plan error does not compile until it is listed here. A property named `line` is not enough to tell:
// Bun puts the line of the throw site on every Error.
const located: Record<PlanErrorTag, true> = {
  AbsoluteNeedsReason: true,
  AmbiguousWord: true,
  BadChapter: true,
  BadEffect: true,
  BadEffectsBlock: true,
  BadParenthetical: true,
  BadPercent: true,
  BadProperty: true,
  BadSceneId: true,
  BadShow: true,
  BadSpeed: true,
  BadTransition: true,
  DuplicateId: true,
  EffectCycle: true,
  EmphasisInDialogue: true,
  EmptyStory: true,
  HiddenNeverRevealed: true,
  MissingId: true,
  NoSuchEvent: true,
  ReleaseOneForm: true,
  SceneBeforeSection: true,
  UnknownReference: true,
  UnknownSfx: true,
  UnsupportedEdge: true,
  UnsupportedElement: true,
};

const hasLine = (failure: Reportable): failure is PlanError =>
  Predicate.hasProperty(located, failure._tag);

/** The flag of `build` and `journey` that fills the speech cache; one name for the flag and the error that points to it. */
export const refreshSpeechFlag = "refresh-speech";

/**
 * What fixes a `SpeechCacheMiss`. The pipeline's error says what is missing; only the CLI knows which command writes
 * the cache, and that `plan` and `check` only read it.
 */
const speechCacheFix = `fill the cache with \`tsukuri build <story> --${refreshSpeechFlag}\`, using the same --speech, --aligner and --cache-dir flags as this command (the speech models must be present unless --speech silent is selected)`;

/**
 * One line: `UnknownReference (line 12): the message`, or `SpeechCacheMiss: the message; the fix` when there is no line.
 */
const describeFailure = (failure: Reportable): string => {
  if (Predicate.isTagged(failure, "SpeechCacheMiss")) {
    return `${failure._tag}: ${failure.message}; ${speechCacheFix}`;
  }

  return hasLine(failure)
    ? `${failure._tag} (line ${failure.line}): ${failure.message}`
    : `${failure._tag}: ${failure.message}`;
};

/** Prints an expected failure to stderr; `Command.run` has already shown the help of a usage error. */
export const reportFailure = (failure: Reportable | CliError.CliError) =>
  CliError.isCliError(failure)
    ? Effect.void
    : Console.error(describeFailure(failure));

// What a failure looks like on the terminal: the tag, the message and the source line when the error has one. No
// stack, no cause. A plain function over the structure every tagged error of the pipeline shares.
import { Console, Effect, Predicate } from "effect";
import { CliError } from "effect/cli";

/** What every expected failure of the pipeline carries. */
export interface Reportable {
  readonly _tag: string;
  readonly message: string;
}

/** One line: `UnknownCue (line 12): the message`, or `SpeechCacheMiss: the message` when there is no line. */
const describeFailure = (failure: Reportable): string => {
  const line: unknown = Predicate.hasProperty(failure, "line")
    ? failure.line
    : undefined;

  return Predicate.isNumber(line)
    ? `${failure._tag} (line ${line}): ${failure.message}`
    : `${failure._tag}: ${failure.message}`;
};

/** Prints an expected failure to stderr; `Command.run` has already shown the help of a usage error. */
export const reportFailure = (failure: Reportable | CliError.CliError) =>
  CliError.isCliError(failure)
    ? Effect.void
    : Console.error(describeFailure(failure));

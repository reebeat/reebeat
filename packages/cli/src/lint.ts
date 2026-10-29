// `reebeat lint <story>` (spec 0002, M2): every problem of the screenplay with its line, what was found, what was
// expected and the nearest valid form, then the rules over the Plan (effect agreement, the absolute times and why
// they were written). Needs no browser, no audio and no adapter. Exits non-zero when anything is an error; an
// absolute time that has its reason is listed as information only.
import { buildPlan, collectErrors } from "@reebeat/core";
import type { PlanError } from "@reebeat/core";
import { lintPlan } from "@reebeat/lint";
import type { Diagnostic } from "@reebeat/lint";
import { readSource } from "@reebeat/pipeline";
import { Array as Arr, Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import { LintFailed } from "./errors.ts";

/** One problem as `file:line: tag: message`; a Plan error always has its line. */
const planErrorRow = (file: string, error: PlanError): string =>
  `${file}:${error.line}: error ${error._tag}: ${error.message}`;

/** One finding of a rule as `file:line: severity rule: message`; a rule that has no line says `file:`. */
const diagnosticRow = (file: string, diagnostic: Diagnostic): string =>
  `${file}:${diagnostic.line === undefined ? "" : `${diagnostic.line}:`} ${diagnostic.severity ?? "error"} ${diagnostic.rule}: ${diagnostic.message}`;

const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Prints every problem of a story; fails with `LintFailed` when one is an error. */
export const lintStory = Effect.fn("lintStory")(function* lintStory(
  story: string
) {
  const source = yield* readSource(story);
  const planErrors = collectErrors(source.text);

  const diagnostics: readonly Diagnostic[] =
    planErrors.length > 0
      ? []
      : lintPlan(yield* buildPlan(source.text, source.sha256));

  const rows = [
    ...Arr.map(planErrors, (found) => planErrorRow(story, found)),
    ...Arr.map(diagnostics, (diagnostic) => diagnosticRow(story, diagnostic)),
  ];

  if (rows.length > 0) {
    yield* Console.log(Arr.join(rows, "\n"));
  }

  const listed = Arr.filter(
    diagnostics,
    ({ severity }) => severity === "info"
  ).length;

  const errors = planErrors.length + diagnostics.length - listed;
  const summary = `${count(errors, "error")}, ${count(listed, "absolute time")} listed`;

  if (errors > 0) {
    return yield* new LintFailed({
      errors,
      message: `${story}: ${summary}`,
    });
  }

  return yield* Console.log(`${story}: ${summary}`);
});

/** The `lint` command. */
export const lintCommand = Command.make(
  "lint",
  {
    story: Argument.String("story").pipe(
      Argument.withDescription("The .fountain screenplay")
    ),
  },
  Effect.fn("reebeat.lint")(function* handleLint(input) {
    yield* lintStory(input.story);
  })
).pipe(
  Command.withDescription(
    "List every problem of a story with its line and the fix, and every absolute time with its reason"
  ),
  Command.withExamples([
    {
      command: "reebeat lint stories/same-id/story.fountain",
      description: "Exits non-zero when the story has an error",
    },
  ])
);

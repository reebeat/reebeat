// `tsukuri lint <story>` (spec 0002, M2): every problem of the screenplay with its line, what was found, what was
// expected and the nearest valid form, then the rules over the Plan (the absolute times and why they were written).
// Needs no browser and no adapter that makes anything. When the speech cache of the story exists it also schedules the
// Plan, so an effect that falls outside its Scene is an error with its line here too; without the cache that is left
// to `plan --timing` and `build`, and a line of the output says which of the two happened. Exits non-zero when
// anything is an error; an absolute time that has its reason is listed as information only.
import { buildPlan, collectErrors } from "@tsukuri/core";
import type { PlanError, PlanJson, ScheduleError } from "@tsukuri/core";
import { lintPlan } from "@tsukuri/lint";
import type { Diagnostic } from "@tsukuri/lint";
import { readSource } from "@tsukuri/pipeline";
import type { Selection } from "@tsukuri/services";
import { Array as Arr, Console, Effect, Option } from "effect";

import type { RunOptions } from "./adapters.ts";
import { LintFailed } from "./errors.ts";
import { scheduledPlan } from "./plan.ts";

/** Where the speech cache is and which adapters key into it: what scheduling needs. */
export interface LintTiming {
  readonly run: RunOptions;
  readonly selection: Selection;
}

/** One problem as `file:line: tag: message`; a Plan error always has its line. */
const planErrorRow = (file: string, error: PlanError): string =>
  `${file}:${error.line}: error ${error._tag}: ${error.message}`;

/** One finding of a rule as `file:line: severity rule: message`; a rule that has no line says `file:`. */
const diagnosticRow = (file: string, diagnostic: Diagnostic): string =>
  `${file}:${diagnostic.line === undefined ? "" : `${diagnostic.line}:`} ${diagnostic.severity ?? "error"} ${diagnostic.rule}: ${diagnostic.message}`;

const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The source line of an effect the error names, or of the Line it names. */
const lineOf = (
  plan: PlanJson,
  error: ScheduleError
): Option.Option<number> => {
  if ("effectId" in error) {
    return Option.flatMap(
      Arr.findFirst(plan.scenes, (scene) => scene.id === error.sceneId),
      (scene) =>
        Option.map(
          Arr.findFirst(
            scene.effects,
            (effect) => effect.id === error.effectId
          ),
          (effect) => effect.line
        )
    );
  }

  return "lineId" in error
    ? Option.map(
        Arr.findFirst(
          Arr.flatMap(plan.scenes, (scene) => scene.lines),
          (line) => line.id === error.lineId
        ),
        (line) => line.line
      )
    : Option.none();
};

/** A scheduling error as a finding: the rule is its tag, and it points at the effect or Line it names. */
const scheduleFinding = (plan: PlanJson, error: ScheduleError): Diagnostic => {
  const base = { message: error.message, rule: error._tag };

  return Option.match(lineOf(plan, error), {
    onNone: () => base,
    onSome: (line) => ({ ...base, line }),
  });
};

type Findings = readonly Diagnostic[] | undefined;

const noCache: Findings = undefined;

/**
 * The scheduling errors of the Plan against the speech cache: none when it schedules, and `undefined` when there is
 * no cache to read (a Line without an asset under the selected adapters), because then nothing was checked.
 */
const scheduleFindings = (plan: PlanJson, timing: LintTiming) => {
  const found = (error: ScheduleError): Effect.Effect<Findings> =>
    Effect.succeed([scheduleFinding(plan, error)]);

  return scheduledPlan(plan, timing.run, timing.selection).pipe(
    Effect.as<Findings>([]),
    Effect.catchTags({
      AlignmentMismatch: found,
      EffectOutsideScene: found,
      EmptyWindow: found,
      LifecycleMismatch: found,
      SceneLeadTooShort: found,
      SpeechCacheMiss: () => Effect.succeed(noCache),
      UnresolvedAnchor: found,
    })
  );
};

const checkedLine =
  "Timing: checked against the speech cache; an effect outside its Scene is an error above.";

const notCheckedLine =
  "Timing: not checked. An effect that falls outside its Scene needs the speech timing, so `tsukuri plan --timing` or `tsukuri build` finds it, not `tsukuri lint` (lint schedules the Plan only when the speech cache of the story exists).";

/** Prints every problem of a story; fails with `LintFailed` when one is an error. */
export const lintStory = Effect.fn("lintStory")(function* lintStory(
  story: string,
  timing?: LintTiming
) {
  const source = yield* readSource(story);
  const planErrors = collectErrors(source.text);

  const plan =
    planErrors.length > 0
      ? undefined
      : yield* buildPlan(source.text, source.sha256);

  const scheduled =
    plan === undefined || timing === undefined
      ? undefined
      : yield* scheduleFindings(plan, timing);

  const diagnostics: readonly Diagnostic[] = [
    ...(plan === undefined ? [] : lintPlan(plan)),
    ...(scheduled ?? []),
  ];

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

  yield* Console.log(scheduled === undefined ? notCheckedLine : checkedLine);

  if (errors > 0) {
    return yield* new LintFailed({
      errors,
      message: `${story}: ${summary}`,
    });
  }

  return yield* Console.log(`${story}: ${summary}`);
});

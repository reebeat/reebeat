// The Plan that the current source builds is the truth the written files are compared with. When the source no
// longer builds, every check that needs it fails with the core's error and its line.
import { planLines, timedLines } from "@reebeat/core";
import type { PlanJson, TimedLine } from "@reebeat/core";
import { Array as Arr, Result } from "effect";

import type { Build } from "./load.ts";

/** The Plan rebuilt from the source, or the sentence that says why there is none. */
export const rebuiltPlan = (build: Build): Result.Result<PlanJson, string> =>
  Result.mapError(
    build.rebuilt,
    (problem) =>
      `the source does not build a Plan (${problem._tag}, source line ${problem.line}): ${problem.message}`
  );

export interface ExpectedLine {
  readonly endFrame: number;
  readonly lineId: string;
  readonly startFrame: number;
  readonly text: string;
}

/** The Lines of the source (text) with the frames of the Timeline, or the first reason there is no such pairing. */
export const expectedLines = (
  build: Build
): Result.Result<readonly ExpectedLine[], string> =>
  Result.flatMap(rebuiltPlan(build), (plan) => {
    const timed = new Map(
      Arr.map(
        timedLines(build.plan.timeline),
        ({ id, timed: line }): [string, TimedLine] => [id, line]
      )
    );

    const lines = planLines(plan);

    return Arr.match(
      Arr.filter(lines, ({ id }) => !timed.has(id)),
      {
        onEmpty: () =>
          Result.succeed(
            Arr.map(lines, ({ id, line }): ExpectedLine => {
              const at = timed.get(id);

              return {
                endFrame: at?.endFrame ?? 0,
                lineId: id,
                startFrame: at?.startFrame ?? 0,
                text: line.text,
              };
            })
          ),
        onNonEmpty: ([first]) =>
          Result.fail(
            `Line ${first.id} of the source is not in the Timeline of plan.json`
          ),
      }
    );
  });

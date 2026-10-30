// The Plan that the current source builds is the truth the written files are compared with. When the source no
// longer builds, every check that needs it fails with the core's error and its line.
import type { PlanJson } from "@tsukuri/core";
import { Result } from "effect";

import type { Build } from "./load.ts";

/** The Plan rebuilt from the source, or the sentence that says why there is none. */
export const rebuiltPlan = (build: Build): Result.Result<PlanJson, string> =>
  Result.mapError(
    build.rebuilt,
    (problem) =>
      `the source does not build a Plan (${problem._tag}, source line ${problem.line}): ${problem.message}`
  );

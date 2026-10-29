// Rule `absolute-times-need-a-reason` (design R3): a Cue or a Hint that pins an absolute time (`at`) must say why,
// because every time in a Plan is otherwise derived from the spoken words. Release 1 has no absolute time: the Plan
// schema has no `at` field on a Cue, a Line or a Hint, and its decoder can be told to reject one
// (`onExcessProperty: "error"`, which the test pins). So no valid Plan can break the rule, and the rule returns no
// diagnostic. It stays as a function so the lint list is complete and so the day an `at` field enters the schema,
// this is the file that must change (its test fails until the rule inspects the new field).
import type { PlanJson } from "@reebeat/core";

import type { Diagnostic } from "./diagnostic.ts";

export const absoluteTimesRule = "absolute-times-need-a-reason";

/** Always `[]` in release 1: no absolute time is representable in the Plan schema. */
export const absoluteTimesNeedReason = (
  _plan: PlanJson
): readonly Diagnostic[] => [];

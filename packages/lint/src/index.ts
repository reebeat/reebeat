// Public surface of @tsukuri/lint: pure rules over a Plan (and over what a Rendering shows), each a plain function
// that returns diagnostics. No I/O, no service, no Effect. The cross-references of a Scene's effects (an Element that
// exists, a `show` of a hidden one, every hidden Element shown once, unique ids) are the core's `collectErrors`: one
// rule, one place; this package holds no copy of them.
import type { PlanJson } from "@tsukuri/core";

import { absoluteTimesNeedReason } from "./absoluteTimes.ts";
import type { Diagnostic } from "./diagnostic.ts";

export {
  absoluteTimesListed,
  absoluteTimesNeedReason,
  absoluteTimesRule,
} from "./absoluteTimes.ts";

export { contrast, contrastRatio, contrastRule } from "./contrast.ts";

export type { ColorPair } from "./contrast.ts";

export type { Diagnostic } from "./diagnostic.ts";

export { firstDifference } from "./difference.ts";

export {
  effectFragmentAgreement,
  effectFragmentAgreementRule,
} from "./effectFragments.ts";

export type { Fragment } from "./effectFragments.ts";

/** Every rule that reads only the Plan, as `tsukuri lint` runs them. */
export const lintPlan = (plan: PlanJson): readonly Diagnostic[] =>
  absoluteTimesNeedReason(plan);

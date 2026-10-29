// Public surface of @reebeat/lint: pure rules over a Plan (and over what a Rendering shows), each a plain function
// that returns diagnostics. No I/O, no service, no Effect.
export { absoluteTimesNeedReason, absoluteTimesRule } from "./absoluteTimes.ts";

export { contrast, contrastRatio, contrastRule } from "./contrast.ts";

export type { ColorPair } from "./contrast.ts";

export {
  cueFragmentAgreement,
  cueFragmentAgreementRule,
} from "./cueFragments.ts";

export type { Fragment } from "./cueFragments.ts";

export type { Diagnostic } from "./diagnostic.ts";

export { firstDifference } from "./difference.ts";

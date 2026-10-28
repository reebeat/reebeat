// The tier gate's entry point: reads the packages under `./packages` and fails, listing each violation as package,
// tier, offending dependency and file:line. The checks live in tiers.ts so tests can run them on fixtures.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Array as Arr, Effect, Path, Schema } from "effect";

import { checkTiers, describeFinding } from "./tiers.ts";

class TierViolations extends Schema.TaggedError<
  TierViolations,
  { readonly brand: unique symbol }
>()("TierViolations", {
  message: Schema.String,
}) {}

const main = Effect.gen(function* main() {
  const path = yield* Path.Path;
  const findings = yield* checkTiers(path.resolve("."));

  if (Arr.isReadonlyArrayNonEmpty(findings)) {
    const report = Arr.join(Arr.map(findings, describeFinding), "\n");

    yield* Effect.logError(report);

    return yield* new TierViolations({ message: report });
  }

  return yield* Effect.log("Tiers clean.");
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)), {
  disableErrorReporting: true,
});

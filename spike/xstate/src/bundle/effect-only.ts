// Bundle-size probe: the baseline, effect alone (what reebeat already ships).
import { Effect } from "effect";

export const run = () => Effect.runPromise(Effect.gen(function* () { return yield* Effect.succeed(1); }));

// A contract is a list of clauses: what a clause does, a sentence saying what it means, and an id. This is the pattern of
// `@tsukuri/services/contract`, written again here because a service-tier package may not import another one.
// `registerClauses` makes each clause a test; `failedClauseIds` reads which clauses a broken implementation fails,
// which is how a stand-in's own tests prove the suite can fail.
import { layer } from "@effect/vitest";
import { Array as Arr, Effect, Exit, Layer } from "effect";

export interface Clause<Failure, Needs> {
  readonly run: Effect.Effect<void, Failure, Needs>;
  readonly means: string;
  readonly id: string;
}

/** Registers each clause as a test of `suiteName`; the tests share one build of `underTest`. */
export const registerClauses = <Provided, Failure, BuildFailure>(
  suiteName: string,
  underTest: Layer.Layer<Provided, BuildFailure>,
  list: readonly Clause<Failure, Provided>[]
): void => {
  layer(underTest)(suiteName, (suite) => {
    for (const { id, means, run } of Arr.fromIterable(list)) {
      suite.effect(`${id}: ${means}`, () => run);
    }
  });
};

/** The ids of the clauses that fail on `underTest`: a typed failure, a defect or an interrupt each count. */
export const failedClauseIds = <Provided, Failure, BuildFailure>(
  underTest: Layer.Layer<Provided, BuildFailure>,
  list: readonly Clause<Failure, Provided>[]
): Effect.Effect<readonly string[], BuildFailure> =>
  Effect.scoped(
    Effect.flatMap(Layer.build(underTest), (context) =>
      Effect.forEach(list, (clause) =>
        Effect.map(
          Effect.exit(Effect.provideContext(clause.run, context)),
          (exit) => (Exit.isFailure(exit) ? [clause.id] : [])
        )
      ).pipe(Effect.map(Arr.flatten))
    )
  );

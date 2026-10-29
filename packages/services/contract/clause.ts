// A contract is a list of clauses. Each clause has an id (`C1`, ...), a sentence saying what it means, and an
// Effect that passes or fails. `xContract` registers every clause as a test named `id: means`. The stand-ins' own
// tests also run the clauses against a deliberately broken adapter (`failingClauses`) and read the ids that fail.
import { layer } from "@effect/vitest";
import { Array as Arr, Effect, Exit, Layer } from "effect";

export interface Clause<E, R> {
  readonly id: string;
  /** What the clause promises, as a sentence. */
  readonly means: string;
  readonly run: Effect.Effect<void, E, R>;
}

/** Registers each clause of a contract as a test of `label`; the tests share one build of `provided`. */
export const registerClauses = <ROut, E, LE>(
  label: string,
  provided: Layer.Layer<ROut, LE>,
  clauses: readonly Clause<E, ROut>[]
): void => {
  layer(provided)(label, (suite) => {
    for (const clause of clauses) {
      suite.effect(`${clause.id}: ${clause.means}`, () => clause.run);
    }
  });
};

/**
 * The ids of the clauses that fail on `provided`, in order: a typed failure, a defect (a failed assertion) or an
 * interrupt each count. The layer is built once and released when the effect ends.
 */
export const failingClauses = <ROut, E, LE>(
  provided: Layer.Layer<ROut, LE>,
  clauses: readonly Clause<E, ROut>[]
): Effect.Effect<readonly string[], LE> =>
  Effect.scoped(
    Effect.gen(function* run() {
      const context = yield* Layer.build(provided);

      const outcomes = yield* Effect.forEach(clauses, (clause) =>
        Effect.map(
          Effect.exit(Effect.provideContext(clause.run, context)),
          (exit) => ({ failed: Exit.isFailure(exit), id: clause.id })
        )
      );

      return Arr.map(
        Arr.filter(outcomes, (outcome) => outcome.failed),
        (outcome) => outcome.id
      );
    })
  );

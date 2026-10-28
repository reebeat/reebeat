// One verdict per falsifier (spec 0001, "Falsifiers"), the table the CLI prints and its exit code. Pure.
import { Array as Arr } from "effect";

export type FalsifierId =
  | "F1"
  | "F2"
  | "F3"
  | "F4"
  | "F5"
  | "F6"
  | "F7"
  | "F8"
  | "F9";

export type Measured = readonly (readonly [string, string | number])[];

/** The outcome of one falsifier on the written files: `detail` says what held or the first thing that did not. */
export interface Verdict {
  readonly detail: string;
  readonly id: FalsifierId;
  readonly measured: Measured;
  readonly ok: boolean;
}

const pass = (
  id: FalsifierId,
  detail: string,
  measured: Measured = []
): Verdict => ({ detail, id, measured, ok: true });

export const fail = (
  id: FalsifierId,
  detail: string,
  measured: Measured = []
): Verdict => ({ detail, id, measured, ok: false });

/** `pass` when `problems` is empty, else `fail` with the first problem and how many there are. */
export const verdictOf = (
  id: FalsifierId,
  held: string,
  problems: readonly string[],
  measured: Measured
): Verdict => {
  const [first] = problems;

  if (first === undefined) {
    return pass(id, held, measured);
  }

  return fail(
    id,
    problems.length === 1
      ? first
      : `${first} (and ${problems.length - 1} more problem${problems.length === 2 ? "" : "s"})`,
    [...measured, ["problems", problems.length]]
  );
};

const verdictLines = (verdict: Verdict): readonly string[] => [
  `${verdict.id}  ${verdict.ok ? "PASS" : "FAIL"}  ${verdict.detail}`,
  ...Arr.map(verdict.measured, ([name, value]) => `      ${name}: ${value}`),
];

/** The verdicts as a table: one header row per falsifier, then its measured values, then a summary row. */
export const renderVerdicts = (verdicts: readonly Verdict[]): string => {
  const failed = Arr.filter(verdicts, (verdict) => !verdict.ok);

  const summary =
    failed.length === 0
      ? `${verdicts.length} of ${verdicts.length} falsifiers hold`
      : `${failed.length} of ${verdicts.length} falsifiers FAIL: ${Arr.join(
          Arr.map(failed, (verdict) => verdict.id),
          ", "
        )}`;

  return `${Arr.join(Arr.flatMap(verdicts, verdictLines), "\n")}\n${summary}\n`;
};

/** 0 when there is at least one verdict and every one holds; else 1. */
export const exitCode = (verdicts: readonly Verdict[]): 0 | 1 =>
  verdicts.length > 0 && Arr.every(verdicts, (verdict) => verdict.ok) ? 0 : 1;

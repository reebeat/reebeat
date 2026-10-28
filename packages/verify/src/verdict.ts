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

/**
 * `pass` and `fail` are what a check observed. `na` says the check cannot observe anything on this build and names
 * why (the build's own manifest lists a silent stand-in for the narrator): it is never a skip, it is printed, and it
 * does not fail the exit code.
 */
export type Status = "fail" | "na" | "pass";

/** The outcome of one falsifier on the written files: `detail` says what held or the first thing that did not. */
export interface Verdict {
  readonly detail: string;
  readonly id: FalsifierId;
  readonly measured: Measured;
  readonly status: Status;
}

const outcome =
  (status: Status) =>
  (id: FalsifierId, detail: string, measured: Measured = []): Verdict => ({
    detail,
    id,
    measured,
    status,
  });

const pass = outcome("pass");

export const fail = outcome("fail");

/** The falsifier cannot be observed on this build; `detail` names why, from what `build.json` lists. */
export const notApplicable = outcome("na");

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

const labels: Readonly<Record<Status, string>> = {
  fail: "FAIL",
  na: "N/A ",
  pass: "PASS",
};

const rowsOf = (item: Verdict): readonly string[] => [
  `${item.id}  ${labels[item.status]}  ${item.detail}`,
  ...Arr.map(item.measured, ([name, value]) => `      ${name}: ${value}`),
];

const withStatus = (
  verdicts: readonly Verdict[],
  status: Status
): readonly Verdict[] => Arr.filter(verdicts, (item) => item.status === status);

const idsOf = (verdicts: readonly Verdict[]): string =>
  Arr.join(
    Arr.map(verdicts, (item) => item.id),
    ", "
  );

/** The verdicts as a table: one header row per falsifier, then its measured values, then a summary row. */
export const renderVerdicts = (verdicts: readonly Verdict[]): string => {
  const failed = withStatus(verdicts, "fail");
  const skipped = withStatus(verdicts, "na");

  const summary =
    failed.length === 0
      ? `${withStatus(verdicts, "pass").length} of ${verdicts.length} falsifiers hold`
      : `${failed.length} of ${verdicts.length} falsifiers FAIL: ${idsOf(failed)}`;

  const note =
    skipped.length === 0 ? "" : `; not applicable: ${idsOf(skipped)}`;

  return `${Arr.join(Arr.flatMap(verdicts, rowsOf), "\n")}\n${summary}${note}\n`;
};

/** 0 when there is at least one verdict and none fails (a `na` verdict is printed and does not fail); else 1. */
export const exitCode = (verdicts: readonly Verdict[]): 0 | 1 =>
  verdicts.length > 0 && withStatus(verdicts, "fail").length === 0 ? 0 : 1;

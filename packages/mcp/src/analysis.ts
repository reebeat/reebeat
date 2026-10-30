// What the read-only tools compute from a Screenplay with the compiler's own functions (spec 0016, G2): the importer's
// errors and the lint rules as data, not as the rows `tsukuri lint` prints. Plain functions: nothing here fails.
import { fountainImporter, planOf } from "@tsukuri/core";
import type { PlanJson } from "@tsukuri/core";
import { allowedTools, stageOf } from "@tsukuri/lifecycle";
import type { BuildRecord, Stage, ToolName } from "@tsukuri/lifecycle";
import { lintPlan } from "@tsukuri/lint";
import type { Diagnostic } from "@tsukuri/lint";
import { Array as Arr, Result } from "effect";

import { present } from "./optional.ts";
import { clip } from "./pages.ts";

/** The most characters of a diagnostic's message a result carries; the rest is in the Screenplay at that line. */
const messageLimit = 500;

interface Finding {
  readonly line?: number;
  readonly message: string;
  readonly rule: string;
  readonly sceneId?: string;
  readonly severity: "error" | "info";
}

export interface Analysis {
  readonly errors: number;
  readonly findings: readonly Finding[];
  readonly listed: number;
  /** The Plan, when the Screenplay imports. */
  readonly plan: PlanJson | undefined;
}

const fromDiagnostic = (diagnostic: Diagnostic): Finding => ({
  ...present("line", diagnostic.line),
  message: clip(diagnostic.message, messageLimit),
  rule: diagnostic.rule,
  ...present("sceneId", diagnostic.sceneId),
  severity: diagnostic.severity ?? "error",
});

/** Every problem of `text`, importer errors first (in document order), then the lint rules over the Plan. */
export const analyse = (text: string, sourceSha256: string): Analysis => {
  const imported = fountainImporter.import(text);

  const importerErrors: readonly Finding[] = Result.match(imported, {
    onFailure: (failures) =>
      Arr.map(failures, (failure): Finding => ({
        line: failure.line,
        message: clip(failure.message, messageLimit),
        rule: failure._tag,
        severity: "error",
      })),
    onSuccess: () => [],
  });

  const plan = Result.getOrUndefined(
    Result.map(imported, (graph) => planOf(graph, sourceSha256))
  );

  const findings = [
    ...importerErrors,
    ...(plan === undefined ? [] : Arr.map(lintPlan(plan), fromDiagnostic)),
  ];

  const listed = Arr.filter(
    findings,
    ({ severity }) => severity === "info"
  ).length;

  return { errors: findings.length - listed, findings, listed, plan };
};

/**
 * The stage of the head (spec 0016, Revisions "first slice"): `built` needs a build of the head Screenplay and a
 * project with no `tsukuri.config.json`, because `build.json` records no config digest (G15); nothing later is
 * reachable without the tools that write the evidence.
 */
export const headStage = (
  analysis: Analysis,
  build: BuildRecord | undefined
): Stage =>
  stageOf({
    built:
      build !== undefined &&
      build.matchesHead.screenplay &&
      build.matchesHead.config === "absent",
    candidate: false,
    lintClean: analysis.errors === 0,
    published: false,
    releaseApproved: false,
    verifiedByServer: false,
  });

/** The tools that make sense for the head now. */
export const allowedFor = (
  build: BuildRecord | undefined
): readonly ToolName[] => allowedTools({ hasBuild: build !== undefined });

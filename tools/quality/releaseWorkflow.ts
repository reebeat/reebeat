// Release workflow rules (spec 0009), checked against fixtures and the real workflow.
import {
  Array as Arr,
  Option,
  Predicate,
  Record,
  Result,
  Schema,
  String as Str,
} from "effect";
import { parse as parseYaml } from "yaml";

/** A workflow file: its name under `.github/workflows` and its text. */
export interface WorkflowFile {
  readonly name: string;
  readonly text: string;
}

const Values = Schema.Record(Schema.String, Schema.Unknown);

const Step = Schema.Struct({
  "continue-on-error": Schema.optional(Schema.Unknown),
  env: Schema.optional(Values),
  if: Schema.optional(Schema.Union([Schema.String, Schema.Boolean])),
  name: Schema.optional(Schema.String),
  run: Schema.optional(Schema.String),
  uses: Schema.optional(Schema.String),
  with: Schema.optional(Values),
});

const Environment = Schema.Union([
  Schema.String,
  Schema.Struct({ name: Schema.String }),
]);

const Job = Schema.Struct({
  "continue-on-error": Schema.optional(Schema.Unknown),
  env: Schema.optional(Values),
  environment: Schema.optional(Environment),
  if: Schema.optional(Schema.String),
  needs: Schema.optional(
    Schema.Union([Schema.String, Schema.Array(Schema.String)])
  ),
  permissions: Schema.optional(Values),
  steps: Schema.optional(Schema.Array(Step)),
});

const Workflow = Schema.Struct({
  env: Schema.optional(Values),
  jobs: Schema.Record(Schema.String, Job),
  on: Schema.Unknown,
});

const decodeWorkflow = Schema.decodeUnknownResult(Workflow);

type Parsed = typeof Workflow.Type;

const parseWorkflow = (file: WorkflowFile): Result.Result<Parsed, string> =>
  Result.flatMap(
    Result.try({
      catch: () => `${file.name} is not valid YAML`,
      try: () => decodeWorkflow(parseYaml(file.text)),
    }),
    (decoded) =>
      Result.mapError(decoded, () => `${file.name} is not a workflow`)
  );

/** Reject npm credential paths anywhere in workflow text, including env, run and with. */
export const tokenFindings = (
  workflows: readonly WorkflowFile[]
): readonly string[] =>
  Arr.flatMap(workflows, ({ name, text }) =>
    /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|\bnpm_[A-Za-z0-9]{20,}|secrets\.(?!GITHUB_TOKEN\b)[A-Za-z_][A-Za-z0-9_]*/iu.test(
      text
    )
      ? [`${name} contains an npm credential reference`]
      : []
  );

const publishCommand =
  /\bchangeset\s+publish\b|\bnpm\s+(?:stage\s+)?publish\b|\bbun\s+publish\b|\bpnpm\s+publish\b|\byarn\s+npm\s+publish\b/u;

/** Publishing is manual, restricted to main, and uses the approved OIDC environment. */
export const modeFindings = (file: WorkflowFile): readonly string[] => {
  const parsed = parseWorkflow(file);

  if (Result.isFailure(parsed)) {
    return [parsed.failure];
  }
  const job = parsed.success.jobs.publish;

  if (job === undefined) {
    return [`${file.name} has no publish job`];
  }

  const environment = Predicate.isString(job.environment)
    ? job.environment
    : job.environment?.name;

  return [
    ...(/workflow_dispatch:/u.test(file.text)
      ? []
      : [`${file.name} is not manually dispatched`]),
    ...(job.if === "github.ref == 'refs/heads/main'"
      ? []
      : [`${file.name} publish is not restricted to main`]),
    ...(environment === "npm-release"
      ? []
      : [`${file.name} publish lacks npm-release environment`]),
    ...(job.permissions?.["id-token"] === "write"
      ? []
      : [`${file.name} publish lacks id-token: write`]),
    ...(Arr.some(job.steps ?? [], (step) => publishCommand.test(step.run ?? ""))
      ? []
      : [`${file.name} has no publish command`]),
  ];
};

/** The script of the first step, in any job, that satisfies `matches`, or none. */
const stepScript = (
  file: WorkflowFile,
  matches: (step: typeof Step.Type) => boolean
): Option.Option<string> =>
  Option.flatMap(Result.getSuccess(parseWorkflow(file)), ({ jobs }) =>
    Option.flatMapNullishOr(
      Arr.findFirst(
        Arr.flatMap(Record.values(jobs), (job) => job.steps ?? []),
        matches
      ),
      (step) => step.run
    )
  );

/** The findings of `check` for each job of the workflow that holds a publish command (a parse failure is a finding). */
const publishingJobFindings = (
  file: WorkflowFile,
  check: (
    name: string,
    job: typeof Job.Type,
    steps: readonly (typeof Step.Type)[]
  ) => readonly string[]
): readonly string[] => {
  const parsed = parseWorkflow(file);

  if (Result.isFailure(parsed)) {
    return [parsed.failure];
  }

  return Arr.flatMap(Record.toEntries(parsed.success.jobs), ([name, job]) => {
    const steps = job.steps ?? [];

    return Arr.some(steps, (step) => publishCommand.test(step.run ?? ""))
      ? check(name, job, steps)
      : [];
  });
};

/** The file whose presence holds the release (operator decision of 2026-10-29). */
const holdFile = ".github/release-hold";

const holdsRelease = (step: typeof Step.Type): boolean =>
  Predicate.isString(step.run) && Str.includes(holdFile)(step.run);

/** The script of the hold step, or none when the workflow has no such step. */
export const holdScript = (file: WorkflowFile): Option.Option<string> =>
  stepScript(file, holdsRelease);

const label = (step: typeof Step.Type): string =>
  step.name ?? step.uses ?? "(unnamed)";

/**
 * Sentences about the release hold. Empty when every job that holds a publish command has a step that tests for
 * `.github/release-hold`, and nothing but the checkout runs before it. (That the script fails while the file exists is
 * run by the test, on the script `holdScript` returns.)
 */
export const holdFindings = (file: WorkflowFile): readonly string[] =>
  publishingJobFindings(file, (name, job, steps) => {
    const held = Arr.findFirstIndex(steps, holdsRelease);

    if (Option.isNone(held)) {
      return [
        `${file.name}: job ${name} publishes and has no step that tests ${holdFile}`,
      ];
    }

    const early = Arr.filterMap(Arr.take(steps, held.value), (step) =>
      Str.startsWith("actions/checkout@")(step.uses ?? "")
        ? Result.failVoid
        : Result.succeed(
            `${file.name}: job ${name} runs step ${label(step)} before the release hold`
          )
    );

    const hold = steps[held.value];

    // A failed hold must stop the job, and no later step may run after it: no continue-on-error, no `if` that can
    // override the failure (`always()`, `failure()`, `!cancelled()`), so no `if` at all.
    const bypasses = [
      ...(job["continue-on-error"] === undefined
        ? []
        : [
            `${file.name}: job ${name} sets continue-on-error, so a failed hold would not stop the publish`,
          ]),
      ...(hold !== undefined && hold["continue-on-error"] !== undefined
        ? [
            `${file.name}: job ${name} sets continue-on-error on the release hold step`,
          ]
        : []),
      ...Arr.filterMap(Arr.drop(steps, held.value), (step) =>
        step.if === undefined
          ? Result.failVoid
          : Result.succeed(
              `${file.name}: job ${name} step ${label(step)} has an if, which could run it after the release hold failed`
            )
      ),
    ];

    return [...early, ...bypasses];
  });

const tagsPreRelease = (step: typeof Step.Type): boolean =>
  Predicate.isString(step.run) && Str.includes("dist-tag add")(step.run);

/** The script of the step that points the pre-release tag at what was published, or none. */
export const tagScript = (file: WorkflowFile): Option.Option<string> =>
  stepScript(file, tagsPreRelease);

/** `npm dist-tag` through trusted publishing needs npm 11.21.0 or later (docs.npmjs.com/trusted-publishers). */
const npmPin = /\bnpm@(?<major>\d+)\.(?<minor>\d+)\.\d+\b/u;

const pinsNewEnoughNpm = (run: string): boolean => {
  const groups = npmPin.exec(run)?.groups;
  const major = Number(groups?.major);
  const minor = Number(groups?.minor);

  return (
    (major === 11 && minor >= 21) || (major === 12 && minor >= 2) || major > 12
  );
};

const removesDevEngines = (step: typeof Step.Type): boolean =>
  Predicate.isString(step.run) && Str.includes("del(.devEngines)")(step.run);

/**
 * Sentences about the pre-release tag. `changeset publish` tags only the first pre-release of a package with the pre tag
 * and sends later ones to `latest`, so every job that publishes must run a `dist-tag add` step after the publish step,
 * with an npm of 11.21.0 or later (pinned: the runner's and devenv's npm are older and a trusted publisher could not
 * move a tag with them), and both npm steps must come after the step that removes `devEngines` from the checkout (npm
 * refuses to run under another package manager's `devEngines`). That the step tags the right versions is run by the
 * test, on `tagScript`.
 */
export const tagFindings = (file: WorkflowFile): readonly string[] =>
  publishingJobFindings(file, (name, _job, steps) => {
    const published = Arr.findLastIndex(steps, (step) =>
      publishCommand.test(step.run ?? "")
    );

    const tag = Option.flatMap(published, (index) =>
      Arr.findFirst(Arr.drop(steps, index + 1), tagsPreRelease)
    );

    const removal = Arr.findFirstIndex(steps, removesDevEngines);

    return [
      ...(Option.isSome(tag)
        ? []
        : [
            `${file.name}: job ${name} publishes and has no later step that runs dist-tag add, so a second pre-release would be tagged latest`,
          ]),
      ...(Option.exists(tag, (step) => pinsNewEnoughNpm(step.run ?? "")) ||
      Option.isNone(tag)
        ? []
        : [
            `${file.name}: job ${name} tags with an npm older than 11.21.0 (11 line) or 12.2.0 (12 line), or an unpinned one, which a trusted publisher cannot use for dist-tag`,
          ]),
      ...(Option.isSome(removal) &&
      Option.exists(published, (index) => removal.value < index)
        ? []
        : [
            `${file.name}: job ${name} has no step that removes devEngines before the publish step`,
          ]),
    ];
  });

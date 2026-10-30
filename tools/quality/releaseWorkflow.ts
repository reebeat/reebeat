// Release workflow rules (spec 0009), checked against fixtures and real workflows.
import {
  Array as Arr,
  Option,
  Order,
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

/** Reject credential references throughout each workflow. */
export const tokenFindings = (
  workflows: readonly WorkflowFile[]
): readonly string[] =>
  Arr.flatMap(workflows, ({ name, text }) =>
    /NPM_TOKEN|NODE_AUTH_TOKEN|_authToken|npmrc|\bnpm_[A-Za-z0-9]{20,}|secrets\.(?!GITHUB_TOKEN\b)[A-Za-z_][A-Za-z0-9_]*/iu.test(
      text
    )
      ? [`${name} contains an npm credential reference`]
      : []
  );

/** The contexts a job condition may test: the dispatch input and the ref. */
export interface RunContext {
  readonly mode: string;
  readonly ref: string;
}

const term =
  /^(?<context>inputs\.mode|github\.ref)\s*==\s*'(?<literal>[^']*)'$/u;

/**
 * Evaluates the one condition grammar the release workflow may use: `<context> == '<literal>'` terms joined by `&&`
 * (the contexts `inputs.mode` and `github.ref`), optionally inside `${{ }}`. Anything else is not evaluated (none):
 * the gate fails closed on a condition it cannot read.
 */
export const evaluateCondition = (
  condition: string,
  run: RunContext
): Option.Option<boolean> => {
  const terms = Arr.map(
    Str.split(
      Str.replaceAll(/^\$\{\{\s*|\s*\}\}$/gu, "")(Str.trim(condition)),
      "&&"
    ),
    (text) => term.exec(Str.trim(text))?.groups
  );

  return Arr.every(terms, Predicate.isNotUndefined)
    ? Option.some(
        Arr.every(terms, (groups) =>
          groups?.context === "inputs.mode"
            ? groups.literal === run.mode
            : groups?.literal === run.ref
        )
      )
    : Option.none();
};

const publishCommand =
  /\bchangeset\s+publish\b|\bnpm\s+(?:stage\s+)?publish\b|\bbun\s+publish\b|\bpnpm\s+publish\b|\byarn\s+npm\s+publish\b/u;

const Dispatch = Schema.Struct({
  on: Schema.Struct({
    workflow_dispatch: Schema.Struct({
      inputs: Schema.Struct({
        mode: Schema.Struct({
          default: Schema.String,
          options: Schema.Array(Schema.String),
          type: Schema.String,
        }),
      }),
    }),
  }),
});

const decodeDispatch = Schema.decodeUnknownResult(Dispatch);

const modes: readonly string[] = ["check", "publish"];

/** `main`, the one ref a release runs from. */
const releaseRef = "refs/heads/main";

/** The names of the jobs of `workflow` that run for a dispatch with this mode and ref, or the jobs it cannot decide. */
const jobsRunning = (
  workflow: Parsed,
  run: RunContext
): Result.Result<readonly string[], string> => {
  const decided = Arr.map(Record.toEntries(workflow.jobs), ([name, job]) => ({
    name,
    runs:
      job.if === undefined ? Option.some(true) : evaluateCondition(job.if, run),
  }));

  const undecided = Arr.filter(decided, ({ runs }) => Option.isNone(runs));

  return Arr.isReadonlyArrayNonEmpty(undecided)
    ? Result.fail(
        `${Arr.join(
          Arr.map(undecided, ({ name }) => name),
          ", "
        )} has a condition the gate cannot evaluate`
      )
    : Result.succeed(
        Arr.filterMap(decided, ({ name, runs }) =>
          Option.contains(runs, true) ? Result.succeed(name) : Result.failVoid
        )
      );
};

/**
 * Sentences about how the release workflow's `mode` input can reach a publish it should not. Empty when: the workflow
 * dispatches by hand only, with an input `mode` of type `choice` whose options are exactly `check` and `publish` and
 * whose default is `check`; every job has a condition the gate can evaluate or none; and for each mode (and for a mode
 * outside the options, and for a ref that is not `main`) the jobs that run hold a publish command only when the mode is
 * `publish` on `main`, and never a job a `check` run could `need`.
 */
export const modeFindings = (file: WorkflowFile): readonly string[] => {
  const parsed = parseWorkflow(file);

  const dispatch = Result.flatMap(
    Result.try({
      catch: () => `${file.name} is not valid YAML`,
      try: () => decodeDispatch(parseYaml(file.text)),
    }),
    (decoded) =>
      Result.mapError(
        decoded,
        () => `${file.name} has no workflow_dispatch input mode`
      )
  );

  if (Result.isFailure(parsed) || Result.isFailure(dispatch)) {
    return [
      ...(Result.isFailure(parsed) ? [parsed.failure] : []),
      ...(Result.isFailure(dispatch) ? [dispatch.failure] : []),
    ];
  }

  const { mode } = dispatch.success.on.workflow_dispatch.inputs;
  const { jobs } = parsed.success;
  const publisher = jobs.publish;

  const environment = Predicate.isString(publisher?.environment)
    ? publisher.environment
    : publisher?.environment?.name;

  const publishing = Arr.filter(Record.keys(jobs), (name) =>
    Arr.some(jobs[name]?.steps ?? [], (step) =>
      publishCommand.test(step.run ?? "")
    )
  );

  const inputFindings = [
    ...(mode.type === "choice"
      ? []
      : [`${file.name} input mode is not a choice`]),
    ...(Arr.join(Arr.sort(mode.options, Order.String), ",") ===
    Arr.join(Arr.sort(modes, Order.String), ",")
      ? []
      : [`${file.name} input mode must offer exactly check and publish`]),
    ...(mode.default === "check"
      ? []
      : [`${file.name} input mode must default to check`]),
  ];

  const cases = Arr.flatMap(["check", "publish", "", "other"], (value) =>
    Arr.map([releaseRef, "refs/heads/feature"], (ref) => ({ mode: value, ref }))
  );

  const reach = Arr.flatMap(cases, (run) => {
    const running = jobsRunning(parsed.success, run);

    if (Result.isFailure(running)) {
      return [`${file.name}: ${running.failure}`];
    }

    const publishes = Arr.filter(running.success, (name) =>
      Arr.contains(publishing, name)
    );

    const mayPublish = run.mode === "publish" && run.ref === releaseRef;

    return [
      ...(Arr.isArrayEmpty(publishes) || mayPublish
        ? []
        : [
            `${file.name}: with mode "${run.mode}" on ${run.ref} the job ${Arr.join(publishes, ", ")} runs and holds a publish command`,
          ]),
      ...(mayPublish && Arr.isArrayEmpty(publishes)
        ? [
            `${file.name}: with mode "publish" on ${releaseRef} no job publishes`,
          ]
        : []),
    ];
  });

  const needsPublisher = Arr.filter(Record.toEntries(jobs), ([, job]) =>
    Arr.some(
      Predicate.isString(job.needs) ? [job.needs] : (job.needs ?? []),
      (needed) => Arr.contains(publishing, needed)
    )
  );

  return [
    ...(environment === "npm-release"
      ? []
      : [`${file.name} publish lacks npm-release environment`]),
    ...(publisher?.permissions?.["id-token"] === "write"
      ? []
      : [`${file.name} publish lacks id-token: write`]),
    ...inputFindings,
    ...reach,
    ...Arr.map(
      needsPublisher,
      ([name]) =>
        `${file.name}: job ${name} needs a job that publishes, so a run that skips the publisher still depends on it`
    ),
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

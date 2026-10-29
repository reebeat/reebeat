// The release workflow rules of spec 0009 (revision of 2026-10-29): where the npm token may come from and go, and that the
// `check` mode cannot publish. Pure functions over file text, so tests run them on fixtures (with a control for each way
// of leaking, drifting or reaching the publish) and on the real files.
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
import { Toml } from "effect/encoding";
import { parse as parseYaml } from "yaml";

/** The one environment whose secret may carry the token. */
const releaseEnvironment = "npm-release";

/** The one step variable npm reads the token from (`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`). */
const tokenVariable = "NODE_AUTH_TOKEN";

/** A workflow file: its name under `.github/workflows` and its text. */
export interface WorkflowFile {
  readonly name: string;
  readonly text: string;
}

const secretReference = /\bsecrets\.(?<name>[A-Za-z_][A-Za-z0-9_]*)/gu;

/** `secrets.GITHUB_TOKEN` is GitHub's own per-run token, not a stored credential. */
const builtIn = "GITHUB_TOKEN";

/** The names of the secrets a text references (`secrets.NAME`), once each, without GitHub's own token. */
export const referencedSecrets = (text: string): readonly string[] =>
  Arr.filter(
    Arr.dedupe(
      Arr.filterMap(
        Arr.fromIterable(Str.matchAll(secretReference)(text)),
        ({ groups }) =>
          Option.match(Option.fromNullishOr(groups?.name), {
            onNone: () => Result.failVoid,
            onSome: Result.succeed,
          })
      )
    ),
    (name) => name !== builtIn
  );

const SecretspecDocument = Schema.Struct({
  profiles: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, Schema.Unknown)
  ),
});

const decodeSecretspec = Schema.decodeUnknownResult(SecretspecDocument);

/** The names of the secrets `secretspec.toml` declares, in every profile (`defaults` holds settings, not a secret). */
export const declaredSecrets = (
  toml: string
): Result.Result<readonly string[], string> =>
  Result.flatMap(
    Result.mapError(
      Toml.parse(toml),
      (problem) => `secretspec.toml is not valid TOML: ${problem.message}`
    ),
    (document) =>
      Result.mapBoth(decodeSecretspec(document), {
        onFailure: () => "secretspec.toml has no [profiles.*] table",
        onSuccess: ({ profiles }) =>
          Arr.dedupe(
            Arr.flatMap(Record.values(profiles), (profile) =>
              Arr.filter(Record.keys(profile), (name) => name !== "defaults")
            )
          ),
      })
  );

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

const environmentOf = (
  environment: typeof Environment.Type | undefined
): string | undefined =>
  Predicate.isString(environment) ? environment : environment?.name;

const mentions = (values: Readonly<Record<string, unknown>> | undefined) =>
  Arr.some(
    Record.values(values ?? {}),
    (value) => Predicate.isString(value) && referencedSecrets(value).length > 0
  );

/** `${{ secrets.NPM_TOKEN }}` and nothing else: the one value the token variable may have. */
const tokenExpression = (name: string): string => `\${{ secrets.${name} }}`;

/** A literal credential: an npm token (`npm_` and 20 or more characters) or an `_authToken` that is not the variable. */
const literalToken =
  /\bnpm_[A-Za-z0-9]{20,}|_authToken\s*=\s*(?!\$\{NODE_AUTH_TOKEN\})\S/u;

/** What a step that holds the token must not run: it would print the token, or trace it. */
const exposing =
  /NODE_AUTH_TOKEN|\bprintenv\b|\bset\s+-\w*x|(?:^|\n)\s*env\s*(?:\||\n|$)/u;

const stepLabel = (step: typeof Step.Type): string => step.name ?? "(unnamed)";

const jobFindings = (
  file: WorkflowFile,
  secret: string,
  [jobName, job]: readonly [string, typeof Job.Type]
): readonly string[] => {
  const steps = job.steps ?? [];
  const using = Arr.filter(steps, (step) => mentions(step.env));
  const where = `${file.name} job ${jobName}`;

  return [
    ...(mentions(job.env)
      ? [
          `${where} reads a secret at job level, not in the one step that runs npm`,
        ]
      : []),
    ...(Arr.isArrayEmpty(using) ||
    environmentOf(job.environment) === releaseEnvironment
      ? []
      : [
          `${where} reads the token outside the ${releaseEnvironment} environment, so a repository secret would serve it`,
        ]),
    ...Arr.flatMap(steps, (step) =>
      mentions(step.with) ||
      (step.run !== undefined && referencedSecrets(step.run).length > 0)
        ? [
            `${where} step ${stepLabel(step)} puts a secret in run or with, where it can be echoed`,
          ]
        : []
    ),
    ...Arr.flatMap(using, (step) => [
      ...Arr.filterMap(Record.toEntries(step.env ?? {}), ([variable, value]) =>
        Predicate.isString(value) &&
        referencedSecrets(value).length > 0 &&
        (variable !== tokenVariable || value !== tokenExpression(secret))
          ? Result.succeed(
              `${where} step ${stepLabel(step)} sets ${variable} to ${value}; only ${tokenVariable}: ${tokenExpression(secret)} is allowed`
            )
          : Result.failVoid
      ),
      ...(step.run !== undefined && exposing.test(step.run)
        ? [
            `${where} step ${stepLabel(step)} holds the token and runs something that can print it`,
          ]
        : []),
    ]),
  ];
};

const workflowFindings = (
  file: WorkflowFile,
  secret: string
): readonly string[] => {
  const references = referencedSecrets(file.text);

  const literal = literalToken.test(file.text)
    ? [
        `${file.name} holds a literal npm credential or an _authToken that is not \${${tokenVariable}}`,
      ]
    : [];

  if (Arr.isReadonlyArrayEmpty(references)) {
    return literal;
  }

  const parsed = parseWorkflow(file);

  if (Result.isFailure(parsed)) {
    return [...literal, parsed.failure];
  }

  return [
    ...literal,
    ...Arr.map(
      Arr.filter(references, (name) => name !== secret),
      (name) =>
        `${file.name} references secret ${name}, which secretspec.toml does not declare`
    ),
    ...(mentions(parsed.success.env)
      ? [`${file.name} reads a secret at workflow level`]
      : []),
    ...Arr.flatMap(Record.toEntries(parsed.success.jobs), (job) =>
      jobFindings(file, secret, job)
    ),
  ];
};

/**
 * Sentences about how the workflows and `secretspec.toml` break the token rule. Empty when: `secretspec.toml` declares
 * exactly one secret; the workflows read exactly that secret (and GitHub's own token); a job reads it only in the
 * `npm-release` environment, in a step's `env` as `NODE_AUTH_TOKEN: ${{ secrets.<name> }}`, and that step prints
 * nothing of it; and no file holds a literal token. A repository secret of the same name cannot be seen from these
 * files: the job's `environment` is what makes the environment secret win, and `gh secret list` shows the rest.
 */
export const tokenFindings = (
  workflows: readonly WorkflowFile[],
  secretspec: string
): readonly string[] => {
  const declared = declaredSecrets(secretspec);

  if (Result.isFailure(declared)) {
    return [declared.failure];
  }

  const [secret, ...others] = declared.success;

  if (secret === undefined || Arr.isReadonlyArrayNonEmpty(others)) {
    return [
      `secretspec.toml must declare exactly one secret, found: ${Arr.isReadonlyArrayNonEmpty(declared.success) ? Arr.join(declared.success, ", ") : "none"}`,
    ];
  }

  const referenced = Arr.flatMap(workflows, ({ text }) =>
    referencedSecrets(text)
  );

  return [
    ...(Arr.contains(referenced, secret)
      ? []
      : [`no workflow reads ${secret}, which secretspec.toml declares`]),
    ...Arr.flatMap(workflows, (file) => workflowFindings(file, secret)),
  ];
};

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
    ...inputFindings,
    ...reach,
    ...Arr.map(
      needsPublisher,
      ([name]) =>
        `${file.name}: job ${name} needs a job that publishes, so a run that skips the publisher still depends on it`
    ),
  ];
};

/** The file whose presence holds the release (operator decision of 2026-10-29). */
const holdFile = ".github/release-hold";

const holdsRelease = (step: typeof Step.Type): boolean =>
  Predicate.isString(step.run) && Str.includes(holdFile)(step.run);

/** The script of the hold step, or none when the workflow has no such step. */
export const holdScript = (file: WorkflowFile): Option.Option<string> =>
  Option.flatMap(Result.getSuccess(parseWorkflow(file)), ({ jobs }) =>
    Option.flatMapNullishOr(
      Arr.findFirst(
        Arr.flatMap(Record.values(jobs), (job) => job.steps ?? []),
        holdsRelease
      ),
      (step) => step.run
    )
  );

const label = (step: typeof Step.Type): string =>
  step.name ?? step.uses ?? "(unnamed)";

/**
 * Sentences about the release hold. Empty when every job that holds a publish command has a step that tests for
 * `.github/release-hold`, and nothing but the checkout runs before it. (That the script fails while the file exists is
 * run by the test, on the script `holdScript` returns.)
 */
export const holdFindings = (file: WorkflowFile): readonly string[] => {
  const parsed = parseWorkflow(file);

  if (Result.isFailure(parsed)) {
    return [parsed.failure];
  }

  return Arr.flatMap(Record.toEntries(parsed.success.jobs), ([name, job]) => {
    const steps = job.steps ?? [];

    if (!Arr.some(steps, (step) => publishCommand.test(step.run ?? ""))) {
      return [];
    }

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
};

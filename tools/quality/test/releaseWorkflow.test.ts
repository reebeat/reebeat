// Release workflow controls (spec 0009).
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  evaluateCondition,
  holdFindings,
  holdScript,
  tagFindings,
  tagScript,
  modeFindings,
  tokenFindings,
} from "../releaseWorkflow.ts";
import type { WorkflowFile } from "../releaseWorkflow.ts";

const checkCondition =
  "inputs.mode == 'check' && github.ref == 'refs/heads/main'";

const publishCondition =
  "inputs.mode == 'publish' && github.ref == 'refs/heads/main'";

interface Changes {
  readonly beforeHold?: string;
  readonly holdExtra?: string;
  readonly jobExtra?: string;
  readonly publishExtra?: string;
  readonly checkRun?: string;
  readonly environment?: string;
  readonly jobEnv?: string;
  readonly mode?: string;
  readonly noHold?: boolean;
  readonly noDevEngines?: boolean;
  readonly noTag?: boolean;
  readonly tagRun?: string;
  readonly needs?: string;
  readonly publishIf?: string;
  readonly publishRun?: string;
  readonly secret?: string;
  readonly variable?: string;
  readonly workflowEnv?: string;
}

/** The hold step of the fixture: the real script, with a line a control may add to the step. */
const holdBlock = (changes: Changes): string =>
  changes.noHold === true
    ? ""
    : `      - name: Release hold\n        run: if [ -e .github/release-hold ]; then exit 1; fi\n${changes.holdExtra ?? ""}`;

/** The step of the fixture that removes `devEngines`, before the npm steps. */
const devEnginesBlock = (changes: Changes): string =>
  changes.noDevEngines === true
    ? ""
    : "      - name: Remove devEngines\n        run: jq 'del(.devEngines)' package.json > p && mv p package.json\n";

/** The step of the fixture that points the pre tag at what was published. */
const tagBlock = (changes: Changes): string =>
  changes.noTag === true
    ? ""
    : `      - name: Tag the pre-release\n        run: ${changes.tagRun ?? "npx --yes npm@11.21.1 dist-tag add x@1.0.0-alpha.1 alpha"}\n`;

/** A release workflow in the shape the real one has, with the lines a control changes made explicit. */
const release = (changes: Changes): WorkflowFile => ({
  name: "release.yml",
  text: `name: Release
on:
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [check, publish]
        default: ${changes.mode ?? "check"}
${changes.workflowEnv ?? ""}
jobs:
  check:
    if: ${checkCondition}
    runs-on: ubuntu-latest
    environment: ${changes.environment ?? "npm-release"}
${changes.needs ?? ""}
    steps:
      - name: Check
        run: ${changes.checkRun ?? "npm --version"}
  publish:
    if: ${changes.publishIf ?? publishCondition}
    runs-on: ubuntu-latest
    environment: ${changes.environment ?? "npm-release"}
    permissions:
      id-token: write
${changes.jobEnv ?? ""}${changes.jobExtra ?? ""}
    steps:
      - uses: actions/checkout@abc
${changes.beforeHold ?? ""}${holdBlock(changes)}${devEnginesBlock(changes)}      - name: Publish
${changes.publishExtra ?? ""}        run: ${changes.publishRun ?? "bunx changeset publish"}
${tagBlock(changes)}`,
});

/** A one-file workflow fixture. */
const fixture = (text: string): readonly WorkflowFile[] => [
  { name: "x.yml", text },
];

const mentioning = (text: string) => (lines: readonly string[]) =>
  Arr.some(lines, Str.includes(text));

describe("token-free trusted publishing", () => {
  it("rejects credential reads and npm auth configuration in any workflow", () => {
    assert.deepStrictEqual(tokenFindings([release({})]), []);

    for (const text of [
      "env: NODE_AUTH_TOKEN",
      "run: echo secrets.NPM_TOKEN",
      "run: echo secrets.ALTERNATE",
      "run: echo _authToken=example",
      "run: cat .npmrc",
      `run: echo npm_${Str.repeat(36)("x")}`,
    ]) {
      assert.isTrue(mentioning("npm credential")(tokenFindings(fixture(text))));
    }
  });

  it("requires the publishing environment and OIDC permission", () => {
    assert.isTrue(
      mentioning("npm-release environment")(
        modeFindings(release({ environment: "staging" }))
      )
    );
    assert.isTrue(
      mentioning("id-token: write")(
        modeFindings({
          ...release({}),
          text: Str.replace(
            "id-token: write",
            "id-token: read"
          )(release({}).text),
        })
      )
    );
  });
});

describe("the release mode", () => {
  const onMain = "refs/heads/main";

  it("reads the condition grammar of the workflow and refuses any other", () => {
    assert.deepStrictEqual(
      evaluateCondition(publishCondition, { mode: "check", ref: onMain }),
      Option.some(false)
    );
    assert.deepStrictEqual(
      evaluateCondition(publishCondition, { mode: "publish", ref: onMain }),
      Option.some(true)
    );
    assert.deepStrictEqual(
      evaluateCondition(`\${{ ${publishCondition} }}`, {
        mode: "publish",
        ref: onMain,
      }),
      Option.some(true)
    );
    assert.isTrue(
      Option.isNone(
        evaluateCondition("inputs.mode != 'check'", {
          mode: "check",
          ref: onMain,
        })
      )
    );
    assert.isTrue(
      Option.isNone(
        evaluateCondition("always()", { mode: "check", ref: onMain })
      )
    );
  });

  it("holds for the workflow in its intended shape: check never reaches the publish (baseline)", () => {
    assert.deepStrictEqual(modeFindings(release({})), []);
  });

  it("fails when the publish job has no mode condition, or one the gate cannot read (controls)", () => {
    assert.isTrue(
      mentioning('with mode "check"')(
        modeFindings(release({ publishIf: "github.ref == 'refs/heads/main'" }))
      )
    );
    assert.isTrue(
      mentioning("cannot evaluate")(
        modeFindings(release({ publishIf: "inputs.mode != 'check'" }))
      )
    );
    assert.isTrue(
      mentioning("refs/heads/feature")(
        modeFindings(release({ publishIf: "inputs.mode == 'publish'" }))
      )
    );
  });

  it("fails when the check job holds a publish command, or needs the publisher (controls)", () => {
    assert.isTrue(
      mentioning('with mode "check"')(
        modeFindings(release({ checkRun: "npm publish --dry-run" }))
      )
    );
    assert.isTrue(
      mentioning("needs a job that publishes")(
        modeFindings(release({ needs: "    needs: publish" }))
      )
    );
  });

  it("fails when the default is not check, or no job publishes in publish mode (controls)", () => {
    assert.isTrue(
      mentioning("must default to check")(
        modeFindings(release({ mode: "publish" }))
      )
    );
    assert.isTrue(
      mentioning("no job publishes")(
        modeFindings(release({ publishRun: "echo nothing" }))
      )
    );
  });
});

const readRepositoryFile = (name: string) =>
  Effect.gen(function* reading() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    return yield* fs.readFileString(
      yield* path.fromFileUrl(new URL(`../../../${name}`, import.meta.url))
    );
  });

/** The services a test that runs a step script needs. */
const services = Effect.all({
  fs: FileSystem.FileSystem,
  path: Path.Path,
  spawner: ChildProcessSpawner.ChildProcessSpawner,
});

/** The real release workflow. */
const releaseWorkflow = Effect.map(
  readRepositoryFile(".github/workflows/release.yml"),
  (text): WorkflowFile => ({ name: "release.yml", text })
);

/** The real release workflow and the script of its step that `find` locates. */
const stepOfRelease = (find: (file: WorkflowFile) => Option.Option<string>) =>
  Effect.gen(function* located() {
    const workflow = yield* releaseWorkflow;

    return { script: yield* Effect.fromOption(find(workflow)), workflow };
  });

describe("the real files", () => {
  it.effect("all workflows contain no npm credential path", () =>
    Effect.gen(function* real() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const root = yield* path.fromFileUrl(
        new URL("../../../.github/workflows/", import.meta.url)
      );

      const names = yield* fs.readDirectory(root);

      const workflows = yield* Effect.forEach(
        Arr.filter(names, (name) => /\.ya?ml$/u.test(name)),
        (name) =>
          Effect.map(
            fs.readFileString(path.join(root, name)),
            (text): WorkflowFile => ({ name, text })
          )
      );

      assert.deepStrictEqual(tokenFindings(workflows), []);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "the release workflow's check mode cannot reach a publish, for any mode or ref",
    () =>
      Effect.gen(function* real() {
        assert.deepStrictEqual(
          modeFindings({
            name: "release.yml",
            text: yield* readRepositoryFile(".github/workflows/release.yml"),
          }),
          []
        );
      }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("requires npm 11.5.1 or newer before publishing", () =>
    Effect.gen(function* real() {
      const text = yield* readRepositoryFile(".github/workflows/release.yml");
      assert.isTrue(Str.includes('"11.5.1" "$version" | sort -V -C')(text));
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "the workflow keeps provenance: id-token write on the publisher and NPM_CONFIG_PROVENANCE",
    () =>
      Effect.gen(function* real() {
        const text = yield* readRepositoryFile(".github/workflows/release.yml");

        assert.isTrue(Str.includes("id-token: write")(text));
        assert.isTrue(Str.includes('NPM_CONFIG_PROVENANCE: "true"')(text));
      }).pipe(Effect.provide(NodeServices.layer))
  );
});

describe("the release hold (operator decision of 2026-10-29)", () => {
  const early = "      - name: Install\n        run: nix profile add x\n";

  it("holds for the shape in which the hold step follows the checkout", () => {
    assert.deepStrictEqual(holdFindings(release({})), []);
  });

  it("fails a publishing job without a hold step, or with a step before it (controls)", () => {
    assert.isTrue(
      mentioning("has no step that tests .github/release-hold")(
        holdFindings(release({ noHold: true }))
      )
    );
    assert.isTrue(
      mentioning("before the release hold")(
        holdFindings(release({ beforeHold: early }))
      )
    );
  });

  it("fails a hold that a failure does not stop: continue-on-error, or an if on a later step (controls)", () => {
    const bypass = mentioning("hold");

    assert.isTrue(
      bypass(
        holdFindings(
          release({ holdExtra: "        continue-on-error: true\n" })
        )
      )
    );
    assert.isTrue(
      bypass(
        holdFindings(release({ jobExtra: "\n    continue-on-error: true" }))
      )
    );
    assert.isTrue(
      mentioning("has an if")(
        holdFindings(release({ publishExtra: "        if: always()\n" }))
      )
    );
    assert.isTrue(
      mentioning("has an if")(
        holdFindings(
          release({ publishExtra: `        if: \${{ !cancelled() }}\n` })
        )
      )
    );
  });

  it.effect(
    "the real hold step refuses where the file exists and passes where it does not, and the real job has one",
    () =>
      Effect.gen(function* running() {
        const { fs, path, spawner } = yield* services;
        const { script, workflow } = yield* stepOfRelease(holdScript);

        const withoutFile = yield* fs.makeTempDirectoryScoped();
        const withFile = yield* fs.makeTempDirectoryScoped();

        yield* fs.makeDirectory(path.join(withFile, ".github"));
        yield* fs.writeFileString(
          path.join(withFile, ".github", "release-hold"),
          "on hold\n"
        );

        const exit = (cwd: string) =>
          spawner.exitCode(
            ChildProcess.make("bash", ["-c", script], { cwd, stdout: "ignore" })
          );

        assert.deepStrictEqual(holdFindings(workflow), []);
        assert.strictEqual(yield* exit(withoutFile), 0);
        assert.strictEqual(yield* exit(withFile), 1);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );
});

describe("the pre-release tag", () => {
  it("holds for a publishing job with a dist-tag step after the publish", () => {
    assert.deepStrictEqual(tagFindings(release({})), []);
  });

  it("fails a publishing job with no dist-tag step after the publish (control)", () => {
    assert.isTrue(
      mentioning("would be tagged latest")(
        tagFindings(release({ noTag: true }))
      )
    );
  });

  it("fails a tag step with an old, unpinned or newer-looking npm, or no devEngines removal (controls)", () => {
    for (const tagRun of [
      "npm dist-tag add x@1.0.0-alpha.1 alpha",
      "npx --yes npm@11.19.0 dist-tag add x@1.0.0-alpha.1 alpha",
      "npx --yes npm@10.9.9 dist-tag add x@1.0.0-alpha.1 alpha",
      "npx --yes npm@12.0.2 dist-tag add x@1.0.0-alpha.1 alpha",
      "npx --yes npm@12.1.0 dist-tag add x@1.0.0-alpha.1 alpha",
    ]) {
      assert.isTrue(
        mentioning("older than 11.21.0")(tagFindings(release({ tagRun })))
      );
    }

    assert.deepStrictEqual(
      tagFindings(
        release({
          tagRun: "npx --yes npm@12.2.0 dist-tag add x@1.0.0-alpha.1 alpha",
        })
      ),
      []
    );
    assert.isTrue(
      mentioning("removes devEngines")(
        tagFindings(release({ noDevEngines: true }))
      )
    );
  });

  it.effect(
    "the real step tags every published version with the pre tag in pre mode, and nothing otherwise",
    () =>
      Effect.gen(function* running() {
        const { fs, path, spawner } = yield* services;
        const { script, workflow } = yield* stepOfRelease(tagScript);

        // A checkout in a temporary directory with two staged packages, and an `npx` that records its arguments.
        const tree = Effect.fnUntraced(function* tree(preMode: string) {
          const root = yield* fs.makeTempDirectoryScoped();
          const bin = path.join(root, "bin");

          yield* fs.makeDirectory(bin);
          yield* fs.writeFileString(
            path.join(bin, "npx"),
            `#!/bin/sh\necho "$@" >> "${path.join(root, "npm.log")}"\n`,
            { mode: 0o755 }
          );
          yield* fs.makeDirectory(path.join(root, ".changeset"));
          yield* fs.writeFileString(
            path.join(root, ".changeset", "pre.json"),
            `{"mode":"${preMode}","tag":"alpha"}`
          );

          yield* Effect.forEach(["core", "lint"], (name) =>
            Effect.gen(function* staged() {
              const dist = path.join(root, "packages", name, "dist");

              yield* fs.makeDirectory(dist, { recursive: true });
              yield* fs.writeFileString(
                path.join(dist, "package.json"),
                `{"name":"@tsukuri/${name}","version":"0.1.0-alpha.1"}`
              );
            })
          );

          return root;
        });

        const run = Effect.fnUntraced(function* run(preMode: string) {
          const root = yield* tree(preMode);

          const exit = yield* spawner.exitCode(
            ChildProcess.make(
              "bash",
              ["-c", `PATH="${path.join(root, "bin")}:$PATH"\n${script}`],
              { cwd: root, stdout: "ignore" }
            )
          );

          const log = path.join(root, "npm.log");

          return {
            calls: (yield* fs.exists(log)) ? yield* fs.readFileString(log) : "",
            exit,
          };
        });

        const pin = /npm@\d+\.\d+\.\d+/u.exec(script)?.[0];

        assert.deepStrictEqual(yield* run("pre"), {
          calls: `--yes ${pin}\u0020dist-tag add @tsukuri/core@0.1.0-alpha.1 alpha\n--yes ${pin}\u0020dist-tag add @tsukuri/lint@0.1.0-alpha.1 alpha\n`,
          exit: 0,
        });
        assert.deepStrictEqual(yield* run("exit"), { calls: "", exit: 0 });
        assert.deepStrictEqual(tagFindings(workflow), []);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  );
});

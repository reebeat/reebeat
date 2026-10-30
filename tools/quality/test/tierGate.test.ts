// The tier gate (spec 0017): ox-dep-lint run with this repository's configuration, on fixture workspaces in temporary
// directories, with a negative control for each guarantee the hand-written gate (`tiers.ts`, retired) documented, and
// on the real repository. The fixtures use the configuration without its baseline, which names a file of the real
// repository; the repository test uses it whole, so a baseline entry no finding needs fails it.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Path } from "effect";
import { checkWorkspace } from "ox-dep-lint";

import tierGate from "../../../oxDepLint.config.ts";
import { tree } from "./tree.ts";

const platform = NodeServices.layer;

const rootManifest =
  '{"name":"fixture","private":true,"workspaces":["packages/*","tools/*"]}\n';

/** A fixture workspace: the root manifest declaring `packages/*` and `tools/*`, and `files`. */
const workspace = (files: Readonly<Record<string, string>>) =>
  tree({ "package.json": rootManifest, ...files });

/** The manifest and entry of `packages/<name>`, with `dependencies` in `field`, and `source` as `src/index.ts`. */
const member = (
  name: string,
  source = "export {};\n",
  dependencies: readonly string[] = [],
  field = "dependencies"
) => ({
  [`packages/${name}/package.json`]: `{"name":"@tsukuri/${name}","${field}":{${Arr.join(
    Arr.map(dependencies, (dependency) => `"${dependency}":"workspace:*"`),
    ","
  )}}}\n`,
  [`packages/${name}/src/index.ts`]: source,
});

/** Each finding as `rule file`: what the gate found and where, without the wording of its message. */
const findingsIn = (root: string): Effect.Effect<readonly string[]> =>
  Effect.sync(() =>
    Arr.map(
      checkWorkspace(root, { ...tierGate, baseline: [] }).findings,
      ({ file, rule }) => `${rule} ${file}`
    )
  );

const check = Effect.fn("check")(function* check(
  files: Readonly<Record<string, string>>
) {
  return yield* findingsIn(yield* workspace(files));
});

const import_ = (specifier: string): string =>
  `import { x } from "${specifier}";\n\nexport const y = x;\n`;

describe("a clean layering passes", () => {
  it.effect(
    "libraries use libraries; the service, programs and adapters use libraries and the service; tools use anything",
    () =>
      Effect.gen(function* clean() {
        const findings = yield* check({
          ...member("core"),
          ...member("subtitles", import_("@tsukuri/core"), ["@tsukuri/core"]),
          ...member("services", import_("@tsukuri/core"), ["@tsukuri/core"]),
          ...member(
            "pipeline",
            `${import_("@tsukuri/services")}${import_("@tsukuri/subtitles")}`,
            ["@tsukuri/services", "@tsukuri/subtitles"]
          ),
          ...member("cache-fs", import_("@tsukuri/services"), [
            "@tsukuri/services",
          ]),
          ...member(
            "cli",
            `${import_("@tsukuri/cache-fs")}${import_("@tsukuri/pipeline")}`,
            ["@tsukuri/cache-fs", "@tsukuri/pipeline", "@tsukuri/core"]
          ),
        });

        assert.deepStrictEqual(findings, []);
      }).pipe(Effect.provide(platform))
  );
});

describe("a package that uses a kind it must not is reported", () => {
  const forbidden = [
    ["a library importing a service", "core", "services"],
    ["a library importing a tool", "core", "cli"],
    ["a service importing an adapter", "services", "cache-fs"],
    ["an adapter importing another adapter", "cache-fs", "encode-ffmpeg"],
    ["an adapter importing a program", "cache-fs", "pipeline"],
    ["a program importing an adapter", "pipeline", "encode-ffmpeg"],
  ] as const;

  for (const [title, from, to] of forbidden) {
    it.effect(`negative control: ${title}`, () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          ...member(from, import_(`@tsukuri/${to}/something`)),
          ...member(to),
        });

        assert.deepStrictEqual(findings, [
          `forbidden-edge packages/${from}/src/index.ts`,
        ]);
      }).pipe(Effect.provide(platform))
    );
  }

  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    it.effect(
      `negative control: ${field} alone is enough, with no import`,
      () =>
        Effect.gen(function* control() {
          const findings = yield* check({
            ...member("core", "export {};\n", ["@tsukuri/services"], field),
            ...member("services"),
          });

          assert.deepStrictEqual(findings, [
            "forbidden-edge packages/core/package.json",
          ]);
        }).pipe(Effect.provide(platform))
    );
  }

  it.effect(
    "negative control: a re-export, a dynamic import and a type-only import of a service from a library",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          ...member(
            "core",
            Arr.join(
              [
                'export * from "@tsukuri/services";',
                'export const a = import("@tsukuri/services");',
                'import type { B } from "@tsukuri/services";',
                "export type C = B;",
                "",
              ],
              "\n"
            )
          ),
          ...member("services"),
        });

        assert.deepStrictEqual(findings, [
          "forbidden-edge packages/core/src/index.ts",
          "forbidden-edge packages/core/src/index.ts",
          "forbidden-edge packages/core/src/index.ts",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a dynamic import with a computed specifier",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check(
          member("core", "export const b = (name: string) => import(name);\n")
        );

        assert.deepStrictEqual(findings, [
          "computed-import packages/core/src/index.ts",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a relative import into another package, and one leaving packages/",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          ...member(
            "core",
            `${import_("../../services/src/index.ts")}${import_("../../../outside.ts")}`
          ),
          ...member("services"),
          "outside.ts": "export const x = 1;\n",
        });

        assert.deepStrictEqual(findings, [
          "relative-import-leaves-package packages/core/src/index.ts",
          "relative-import-leaves-package packages/core/src/index.ts",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: depending on a workspace name no package has",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check(
          member("cli", "export {};\n", ["@tsukuri/mystery"])
        );

        assert.deepStrictEqual(findings, [
          "unknown-workspace-package packages/cli/package.json",
        ]);
      }).pipe(Effect.provide(platform))
  );
});

describe("a directory under packages/ must be a package of a kind", () => {
  it.effect(
    "negative control: a new package in no kind, a directory without a package.json, and an empty one",
    () =>
      Effect.gen(function* control() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* workspace({
          ...member("core"),
          ...member("mystery"),
          "packages/loose/src/index.ts": "export {};\n",
        });

        yield* fs.makeDirectory(path.join(root, "packages", "empty"));

        assert.deepStrictEqual(yield* findingsIn(root), [
          "directory-without-package packages/empty",
          "directory-without-package packages/loose",
          "package-without-kind packages/mystery/package.json",
        ]);
      }).pipe(Effect.provide(platform))
  );
});

describe("what the gate reads, and what it refuses to skip", () => {
  it.effect(
    "tests, live suites, fixtures (at any depth), build output and declarations are not read",
    () =>
      Effect.gen(function* skipped() {
        const violation = import_("@tsukuri/services");

        const findings = yield* check({
          ...member("core"),
          ...member("services"),
          "packages/core/dist/o.ts": violation,
          "packages/core/live/l.ts": violation,
          "packages/core/src/fixtures/f.ts": violation,
          "packages/core/src/live/l.ts": violation,
          "packages/core/src/test/deep.ts": violation,
          "packages/core/src/types.d.ts": violation,
          "packages/core/test/fixtures/f.ts": violation,
          "packages/core/test/t.ts": violation,
        });

        assert.deepStrictEqual(findings, []);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a symbolic link under the sources is a finding, not followed and not skipped",
    () =>
      Effect.gen(function* linked() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* workspace({
          ...member("core"),
          ...member("services"),
        });

        yield* fs.symlink(
          path.join("..", "..", "services", "src"),
          path.join(root, "packages", "core", "src", "link")
        );

        yield* fs.makeDirectory(path.join(root, "packages", "core", "test"));

        yield* fs.symlink(
          path.join("..", "..", "services", "src"),
          path.join(root, "packages", "core", "test", "link")
        );

        assert.deepStrictEqual(yield* findingsIn(root), [
          "symbolic-link packages/core/src/link",
        ]);
      }).pipe(Effect.provide(platform))
  );
});

describe("the repository", () => {
  it.effect(
    "every package is in a kind, no package depends against the direction, and the baseline is needed",
    () =>
      Effect.gen(function* repository() {
        const path = yield* Path.Path;

        const root = path.resolve(
          yield* path.fromFileUrl(new URL("../../..", import.meta.url))
        );

        const { findings } = yield* Effect.sync(() =>
          checkWorkspace(root, tierGate)
        );

        assert.deepStrictEqual(
          Arr.map(findings, ({ file, rule }) => `${rule} ${file}`),
          []
        );
      }).pipe(Effect.provide(platform))
  );
});

// The release rules (spec 0009) on fixtures, with a negative control for each rule, and on the real repository:
// the published set, every published manifest and every effect peer range.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Order,
  Path,
  Record,
  Schema,
  String as Str,
  Struct,
} from "effect";

import {
  decodeRoot,
  directiveFindings,
  importUses,
  isEffectFamily,
  packageOf,
  peerFindings,
  publicPackages,
  publishedSources,
  publishManifest,
  readPackages,
  scanUnstable,
  undeclaredImports,
  unexpectedFiles,
  unstableModules,
  usesOf,
  versionsOf,
} from "../release.ts";
import type {
  ImportUse,
  RootManifest,
  SourceManifest,
  WorkspacePackage,
} from "../release.ts";

/** A `tsc` scan takes about a second on a development machine and several on a CI runner. */
const scanTimeout = 60_000;

const root: RootManifest = {
  bugs: { url: "https://example.test/issues" },
  catalog: { effect: "4.1.0", "fountain-js": "1.2.4" },
  homepage: "https://example.test",
  repository: { type: "git", url: "git+https://example.test/r.git" },
};

const manifest = (overrides: Partial<SourceManifest>): SourceManifest => ({
  exports: { ".": "./src/index.ts" },
  license: "Apache-2.0",
  name: "@tsukuri/probe",
  publishConfig: { access: "public", directory: "dist" },
  version: "0.1.0-alpha.0",
  ...overrides,
});

const fixtureVersions = { "@tsukuri/core": "0.1.0-alpha.0" };

const stage = (overrides: Partial<SourceManifest>) =>
  publishManifest(
    { directory: "probe", manifest: manifest(overrides) },
    root,
    fixtureVersions
  );

const without = (key: "license" | "publishConfig") =>
  publishManifest(
    { directory: "probe", manifest: Struct.omit(manifest({}), [key]) },
    root,
    fixtureVersions
  );

const findings = (
  overrides: Partial<SourceManifest>,
  uses: readonly ImportUse[],
  unstable: readonly string[]
) => peerFindings(manifest(overrides), uses, unstable, root.catalog);

const names = (list: readonly WorkspacePackage[]) =>
  Arr.sort(
    Arr.map(list, ({ manifest: { name } }) => name),
    Order.String
  );

describe("the manifest a package publishes", () => {
  it("rewrites workspace:* to the exact version and catalog: to the catalog's", () => {
    const staged = stage({
      dependencies: {
        "@tsukuri/core": "workspace:*",
        "fountain-js": "catalog:",
        parse5: "^8.0.1",
      },
    });

    assert.deepStrictEqual(staged.problems, []);
    assert.deepStrictEqual(staged.manifest.dependencies, {
      "@tsukuri/core": "0.1.0-alpha.0",
      "fountain-js": "1.2.4",
      parse5: "^8.0.1",
    });
  });

  it("points exports at the built files and the repository at its directory", () => {
    const staged = stage({
      exports: { ".": "./src/index.ts", "./x": "./x/i.ts" },
    });

    assert.deepStrictEqual(staged.manifest.exports, {
      ".": { default: "./src/index.mjs", types: "./src/index.d.mts" },
      "./x": { default: "./x/i.mjs", types: "./x/i.d.mts" },
    });
    // Order is meaning: the first condition that matches wins, and `default` matches anything.
    assert.deepStrictEqual(Record.keys(staged.manifest.exports["."] ?? {}), [
      "types",
      "default",
    ]);
    assert.strictEqual(staged.manifest.repository.directory, "packages/probe");
    assert.strictEqual(staged.manifest.repository.url, root.repository.url);
  });

  it("fails a workspace dependency that is not a public package (negative control)", () => {
    assert.deepStrictEqual(
      stage({ dependencies: { "@tsukuri/cli": "workspace:*" } }).problems
        .length,
      1
    );
  });

  it("fails a catalog entry the catalog lacks, and a workspace or catalog range that is not rewritten", () => {
    assert.strictEqual(
      stage({ dependencies: { missing: "catalog:" } }).problems.length,
      1
    );
    assert.strictEqual(
      stage({ dependencies: { "@tsukuri/core": "workspace:^" } }).problems
        .length,
      1
    );
    assert.strictEqual(
      stage({ dependencies: { effect: "catalog:default" } }).problems.length,
      1
    );
  });

  it("fails a package with no licence, a source export that is not .ts, or the wrong publishConfig", () => {
    assert.deepStrictEqual(without("license").problems, [
      "@tsukuri/probe declares no license",
    ]);
    assert.strictEqual(
      stage({ exports: { ".": "./src/index.js" } }).problems.length,
      1
    );
    assert.strictEqual(without("publishConfig").problems.length, 2);
  });
});

describe("what a tarball may hold", () => {
  it("accepts built output and the named files", () => {
    assert.deepStrictEqual(
      unexpectedFiles([
        "package.json",
        "LICENSE",
        "NOTICE",
        "README.md",
        "CHANGELOG.md",
        "src/index.mjs",
        "src/index.d.mts",
        "wordAligner-NMrVJ6Qg.d.mts",
      ]),
      []
    );
  });

  it("names sources, tests, maps and build info (negative control)", () => {
    assert.deepStrictEqual(
      unexpectedFiles([
        "src/index.ts",
        "test/a.test.ts",
        "src/index.mjs.map",
        "tsconfig.tsbuildinfo",
      ]),
      [
        "src/index.ts",
        "test/a.test.ts",
        "src/index.mjs.map",
        "tsconfig.tsbuildinfo",
      ]
    );
  });
});

/** What `tsc` prints for `packages/services` when `allowedUnstableApis` is empty (abridged). */
const reported = Arr.join(
  [
    "contract/assetCache.ts(265,7): error TS377136: `@effect/vitest#it` is an unstable API. Breaking changes may happen between versions. effect(unstableApiUsage)",
    "contract/encoder.ts(42,16): error TS377136: `effect/FileSystem#FileSystem` is an unstable API. Breaking changes may happen between versions. effect(unstableApiUsage)",
    "contract/encoder.ts(46,38): error TS377136: `effect/FileSystem#FileSystem` is an unstable API. Breaking changes may happen between versions. effect(unstableApiUsage)",
    "src/cacheKey.ts(72,55): error TS377136: `effect/crypto/Digest#Digest` is an unstable API. Breaking changes may happen between versions. effect(unstableApiUsage)",
    "src/x.ts(1,1): error TS377137: `effect/unstable/http#HttpClient` is an experimental API. effect(experimentalApiUsage)",
    "src/y.ts(3,1): error TS2322: Type 'string' is not assignable to type 'number'.",
  ],
  "\n"
);

/** A package `probe` in a temporary tree under tools/quality (so `effect` resolves), checked as a published package. */
const scan = Effect.fn("scan")(function* scan(source: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const quality = yield* path.fromFileUrl(new URL("..", import.meta.url));

  const top = yield* fs.makeTempDirectoryScoped({
    directory: quality,
    prefix: ".scan-",
  });

  const directory = path.join(top, "packages", "probe");

  yield* fs.makeDirectory(path.join(directory, "src"), { recursive: true });
  yield* fs.writeFileString(
    path.join(directory, "tsconfig.json"),
    `{ "extends": "${path.join(quality, "tsconfig.json")}" }`
  );
  yield* fs.writeFileString(path.join(directory, "src", "index.ts"), source);

  return yield* scanUnstable(
    path.join(quality, "node_modules", ".bin", "tsc"),
    top,
    { directory: "probe", manifest: manifest({}) }
  );
}, Effect.scoped);

describe("unstable Effect APIs used by the published sources", () => {
  it("names the module of each unstable or experimental API a tsc run reports, once, and ignores other errors", () => {
    assert.deepStrictEqual(unstableModules(reported), [
      "@effect/vitest",
      "effect/FileSystem",
      "effect/crypto/Digest",
      "effect/unstable/http",
    ]);
    assert.deepStrictEqual(unstableModules(""), []);
  });

  it.effect(
    "the compiler finds a root-barrel binding, a module import and a namespace import, and nothing in a stable one (controls)",
    () =>
      Effect.gen(function* controls() {
        assert.deepStrictEqual(
          yield* scan(
            'import { FileSystem } from "effect";\nexport const fs = FileSystem.FileSystem;\n'
          ),
          ["effect/FileSystem"]
        );
        assert.deepStrictEqual(
          yield* scan(
            'import { Digest } from "effect/crypto";\nexport const digest = Digest.sha256;\n'
          ),
          ["effect/crypto/Digest"]
        );
        assert.deepStrictEqual(
          yield* scan(
            'import * as Path from "effect/Path";\nexport const path = Path.Path;\n'
          ),
          ["effect/Path"]
        );
        assert.deepStrictEqual(
          yield* scan(
            'import { Effect } from "effect";\nexport const one = Effect.succeed(1);\n'
          ),
          []
        );
        // Why directives are refused: the compiler obeys them, so the scan alone would report no use here.
        assert.deepStrictEqual(
          yield* scan(
            '// @effect-diagnostics unstableApiUsage:off\nimport { FileSystem } from "effect";\nexport const fs = FileSystem.FileSystem;\n'
          ),
          []
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    scanTimeout
  );

  it("finds an @effect-diagnostics directive in any form, and only that", () => {
    const sources = [
      { file: "a.ts", text: "// @effect-diagnostics unstableApiUsage:off\n" },
      { file: "b.ts", text: "// @effect-diagnostics-next-line *:off\n" },
      {
        file: "c.ts",
        text: "/* @effect-diagnostics floatingEffect:skip-file */",
      },
      {
        file: "d.ts",
        text: "// effect diagnostics are documented elsewhere\n",
      },
    ];

    assert.deepStrictEqual(
      Arr.map(directiveFindings(sources), Str.slice(0, 4)),
      ["a.ts", "b.ts", "c.ts"]
    );
  });

  it("names the package of a specifier", () => {
    assert.strictEqual(packageOf("effect/Cause"), "effect");
    assert.strictEqual(packageOf("@effect/vitest/utils"), "@effect/vitest");
    assert.isTrue(isEffectFamily("@effect/platform-node"));
    assert.isFalse(isEffectFamily("fountain-js"));
  });
});

describe("the effect peer range", () => {
  const imports = importUses('import { Effect } from "effect";');
  const crypto = ["effect/crypto/Digest"];

  it("accepts ^ for stable APIs and ~ for an unstable API", () => {
    assert.deepStrictEqual(
      findings({ peerDependencies: { effect: "^4.1.0" } }, imports, []),
      []
    );
    assert.deepStrictEqual(
      findings({ peerDependencies: { effect: "~4.1.0" } }, imports, crypto),
      []
    );
  });

  it("fails ^ when an unstable API is reached: the next minor may break it (negative control)", () => {
    assert.strictEqual(
      findings({ peerDependencies: { effect: "^4.1.0" } }, imports, crypto)
        .length,
      1
    );
  });

  it("fails ~ for stable-only use, a pin outside the range, and a range that is not a floor", () => {
    assert.strictEqual(
      findings({ peerDependencies: { effect: "~4.1.0" } }, imports, []).length,
      1
    );
    assert.strictEqual(
      findings({ peerDependencies: { effect: "~4.0.0" } }, imports, crypto)
        .length,
      1
    );
    assert.strictEqual(
      findings({ peerDependencies: { effect: ">=4.1.0 <5" } }, imports, [])
        .length,
      1
    );
  });

  it("fails effect as a dependency, and effect imported but not declared", () => {
    assert.strictEqual(
      findings({ dependencies: { effect: "catalog:" } }, [], []).length,
      1
    );
    assert.strictEqual(findings({}, imports, []).length, 1);
  });
});

const ChangesetConfig = Schema.fromJsonString(
  Schema.Struct({ fixed: Schema.Array(Schema.Array(Schema.String)) })
);

const repository = Effect.gen(function* repository() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const top = yield* path.fromFileUrl(new URL("../../..", import.meta.url));

  const changesets = yield* Schema.decodeEffect(ChangesetConfig)(
    yield* fs.readFileString(path.join(top, ".changeset", "config.json"))
  );

  return {
    changesets,
    manifest: yield* decodeRoot(
      yield* fs.readFileString(path.join(top, "package.json"))
    ),
    packages: yield* readPackages(top),
    top,
  };
});

describe("the real repository", () => {
  it.effect("every published package builds a clean manifest", () =>
    Effect.gen(function* published() {
      const { manifest: top, packages } = yield* repository;
      const versions = versionsOf(packages);

      const problems = Arr.flatMap(
        publicPackages(packages),
        (workspace) => publishManifest(workspace, top, versions).problems
      );

      assert.deepStrictEqual(problems, []);
      assert.isAbove(Arr.length(publicPackages(packages)), 0);
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect("the Changesets fixed group is exactly the published set", () =>
    Effect.gen(function* fixed() {
      const { changesets, packages } = yield* repository;

      assert.deepStrictEqual(
        Arr.sort(Arr.flatten(changesets.fixed), Order.String),
        names(publicPackages(packages))
      );
    }).pipe(Effect.provide(NodeServices.layer))
  );

  it.effect(
    "every published package declares effect as a peer with the range its APIs need",
    () =>
      Effect.gen(function* peers() {
        const path = yield* Path.Path;
        const { manifest: top, packages, top: where } = yield* repository;
        const tsc = path.join(where, "node_modules", ".bin", "tsc");

        const perPackage = yield* Effect.forEach(
          publicPackages(packages),
          (workspace) =>
            Effect.map(
              Effect.all([
                publishedSources(where, workspace),
                scanUnstable(tsc, where, workspace),
              ]),
              ([sources, unstable]) =>
                peerFindings(
                  workspace.manifest,
                  usesOf(sources),
                  unstable,
                  top.catalog
                )
            ),
          { concurrency: 4 }
        );

        assert.deepStrictEqual(Arr.flatten(perPackage), []);
      }).pipe(Effect.provide(NodeServices.layer)),
    scanTimeout
  );

  it.effect(
    "published sources import only declared packages and carry no @effect-diagnostics directive (issue #14 covers the other suppressions)",
    () =>
      Effect.gen(function* sources() {
        const { packages, top: where } = yield* repository;

        const perPackage = yield* Effect.forEach(
          publicPackages(packages),
          (workspace) =>
            Effect.map(publishedSources(where, workspace), (files) => [
              ...undeclaredImports(workspace.manifest, usesOf(files)),
              ...directiveFindings(files),
            ])
        );

        assert.deepStrictEqual(Arr.flatten(perPackage), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );
});

describe("imports that the build could not resolve", () => {
  it("names a development dependency, which the bundler would inline (negative control)", () => {
    assert.deepStrictEqual(
      undeclaredImports(
        manifest({
          dependencies: { "fountain-js": "catalog:" },
          devDependencies: { "oxc-parser": "catalog:" },
        }),
        importUses(
          'import { parseSync } from "oxc-parser";\nimport Fountain from "fountain-js";\nimport { readFile } from "node:fs";\nimport { x } from "./x.ts";'
        )
      ),
      [
        "@tsukuri/probe imports oxc-parser, which is in neither dependencies nor peerDependencies",
      ]
    );
  });
});

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
  Schema,
  Struct,
} from "effect";

import {
  decodeRoot,
  importUses,
  isEffectFamily,
  packageOf,
  peerFindings,
  publicPackages,
  publishedUses,
  publishManifest,
  readPackages,
  unexpectedFiles,
  unstableApisUsed,
  versionsOf,
} from "../release.ts";
import type {
  ImportUse,
  RootManifest,
  SourceManifest,
  WorkspacePackage,
} from "../release.ts";

const root: RootManifest = {
  bugs: { url: "https://example.test/issues" },
  catalog: { effect: "4.1.0", "fountain-js": "1.2.4" },
  homepage: "https://example.test",
  repository: { type: "git", url: "git+https://example.test/r.git" },
};

const manifest = (overrides: Partial<SourceManifest>): SourceManifest => ({
  exports: { ".": "./src/index.ts" },
  license: "Apache-2.0",
  name: "@reebeat/probe",
  publishConfig: { access: "public", directory: "dist" },
  version: "0.1.0-alpha.0",
  ...overrides,
});

const fixtureVersions = { "@reebeat/core": "0.1.0-alpha.0" };

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

const allowed = [
  "effect/crypto/Digest",
  "effect/FileSystem",
  "@effect/vitest",
] as const;

const used = (text: string) => unstableApisUsed(importUses(text), allowed);

const findings = (
  overrides: Partial<SourceManifest>,
  uses: readonly ImportUse[]
) => peerFindings(manifest(overrides), uses, allowed, root.catalog);

const names = (list: readonly WorkspacePackage[]) =>
  Arr.sort(
    Arr.map(list, ({ manifest: { name } }) => name),
    Order.String
  );

describe("the manifest a package publishes", () => {
  it("rewrites workspace:* to the exact version and catalog: to the catalog's", () => {
    const staged = stage({
      dependencies: {
        "@reebeat/core": "workspace:*",
        "fountain-js": "catalog:",
        parse5: "^8.0.1",
      },
    });

    assert.deepStrictEqual(staged.problems, []);
    assert.deepStrictEqual(staged.manifest.dependencies, {
      "@reebeat/core": "0.1.0-alpha.0",
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
    assert.strictEqual(staged.manifest.repository.directory, "packages/probe");
    assert.strictEqual(staged.manifest.repository.url, root.repository.url);
  });

  it("fails a workspace dependency that is not a public package (negative control)", () => {
    assert.deepStrictEqual(
      stage({ dependencies: { "@reebeat/cli": "workspace:*" } }).problems
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
      stage({ dependencies: { "@reebeat/core": "workspace:^" } }).problems
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
      "@reebeat/probe declares no license",
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

describe("unstable Effect APIs reached by the published sources", () => {
  it("sees a module, a binding of its parent, and a namespace import", () => {
    assert.deepStrictEqual(used('import { Digest } from "effect/crypto";'), [
      "effect/crypto/Digest",
    ]);
    assert.deepStrictEqual(
      used('import { Effect, FileSystem } from "effect";'),
      ["effect/FileSystem"]
    );
    assert.deepStrictEqual(used('import * as Fs from "effect/FileSystem";'), [
      "effect/FileSystem",
    ]);
    assert.deepStrictEqual(used('export { assert } from "@effect/vitest";'), [
      "@effect/vitest",
    ]);
  });

  it("sees nothing in stable imports", () => {
    assert.deepStrictEqual(
      used(
        'import { Effect, Schema } from "effect";\nimport { Cause } from "effect/Cause";'
      ),
      []
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
  const stable = importUses('import { Effect } from "effect";');
  const unstable = importUses('import { Digest } from "effect/crypto";');

  it("accepts ^ for stable APIs and ~ for an unstable API", () => {
    assert.deepStrictEqual(
      findings({ peerDependencies: { effect: "^4.1.0" } }, stable),
      []
    );
    assert.deepStrictEqual(
      findings({ peerDependencies: { effect: "~4.1.0" } }, unstable),
      []
    );
  });

  it("fails ^ when an unstable API is reached: the next minor may break it (negative control)", () => {
    assert.strictEqual(
      findings({ peerDependencies: { effect: "^4.1.0" } }, unstable).length,
      1
    );
  });

  it("fails ~ for stable-only use, a pin outside the range, and a range that is not a floor", () => {
    assert.strictEqual(
      findings({ peerDependencies: { effect: "~4.1.0" } }, stable).length,
      1
    );
    assert.strictEqual(
      findings({ peerDependencies: { effect: "~4.0.0" } }, unstable).length,
      1
    );
    assert.strictEqual(
      findings({ peerDependencies: { effect: ">=4.1.0 <5" } }, stable).length,
      1
    );
  });

  it("fails effect as a dependency, and effect imported but not declared", () => {
    assert.strictEqual(
      findings({ dependencies: { effect: "catalog:" } }, []).length,
      1
    );
    assert.strictEqual(findings({}, stable).length, 1);
  });
});

const Tsconfig = Schema.fromJsonString(
  Schema.Struct({
    compilerOptions: Schema.Struct({
      plugins: Schema.Array(
        Schema.Struct({
          allowedUnstableApis: Schema.optionalKey(Schema.Array(Schema.String)),
        })
      ),
    }),
  })
);

const ChangesetConfig = Schema.fromJsonString(
  Schema.Struct({ fixed: Schema.Array(Schema.Array(Schema.String)) })
);

const repository = Effect.gen(function* repository() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const top = yield* path.fromFileUrl(new URL("../../..", import.meta.url));

  const tsconfig = yield* Schema.decodeEffect(Tsconfig)(
    yield* fs.readFileString(path.join(top, "tsconfig.json"))
  );

  const changesets = yield* Schema.decodeEffect(ChangesetConfig)(
    yield* fs.readFileString(path.join(top, ".changeset", "config.json"))
  );

  return {
    allowedUnstable: Arr.flatMap(
      tsconfig.compilerOptions.plugins,
      (plugin) => plugin.allowedUnstableApis ?? []
    ),
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
        const {
          allowedUnstable,
          manifest: top,
          packages,
          top: where,
        } = yield* repository;

        const perPackage = yield* Effect.forEach(
          publicPackages(packages),
          ({ directory, manifest: source }) =>
            Effect.map(publishedUses(where, directory), (uses) =>
              peerFindings(source, uses, allowedUnstable, top.catalog)
            )
        );

        assert.deepStrictEqual(Arr.flatten(perPackage), []);
      }).pipe(Effect.provide(NodeServices.layer))
  );
});

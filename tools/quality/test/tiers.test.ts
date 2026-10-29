// The tier gate on fixtures in temporary directories, with a negative control for each forbidden direction, and on the
// real repository: every directory under `packages/` is in the table and no package depends against the direction.
import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Option,
  Path,
  PlatformError,
  Record,
} from "effect";

import {
  checkTiers,
  describeFinding,
  edgeViolation,
  importsOf,
  sourceFiles,
  tierOf,
  tiers,
} from "../tiers.ts";

interface Fixture {
  /** Dependencies written to the package's manifest. */
  readonly dependencies?: readonly string[];
  /** The text of `src/index.ts`. */
  readonly source?: string;
}

/** Files of a tree in a fresh temporary directory (removed with the scope): path relative to it, then the text. */
const tree = Effect.fn("tree")(function* tree(
  files: Readonly<Record<string, string>>
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();

  yield* Effect.forEach(Record.toEntries(files), ([name, text]) =>
    Effect.gen(function* write() {
      const file = path.join(root, name);

      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, text);
    })
  );

  return root;
});

/** Writes `packages/<name>` for each entry into a fresh temporary root (removed with the scope) and checks it. */
const check = Effect.fn("check")(function* check(
  packages: Readonly<Record<string, Fixture>>
) {
  const root = yield* tree(
    Record.fromEntries(
      Arr.flatMap(Record.toEntries(packages), ([name, fixture]) => [
        [
          `packages/${name}/package.json`,
          `{"name":"@reebeat/${name}","dependencies":{${Arr.join(
            Arr.map(
              fixture.dependencies ?? [],
              (dependency) => `"${dependency}":"workspace:*"`
            ),
            ","
          )}}}`,
        ] as const,
        [
          `packages/${name}/src/index.ts`,
          fixture.source ?? "export {};\n",
        ] as const,
      ])
    )
  );

  return yield* checkTiers(root);
});

const platform = NodeServices.layer;

const import_ = (specifier: string): string =>
  `import { x } from "${specifier}";\n\nexport const y = x;\n`;

describe("a clean layering passes", () => {
  it.effect(
    "libraries use libraries, services use libraries, adapters use services and libraries",
    () =>
      Effect.gen(function* clean() {
        const findings = yield* check({
          "cache-fs": {
            dependencies: ["@reebeat/services", "@reebeat/core"],
            source: import_("@reebeat/services"),
          },
          core: {},
          pipeline: {
            dependencies: ["@reebeat/services"],
            source: import_("@reebeat/services/contract"),
          },
          services: {
            dependencies: ["@reebeat/core"],
            source: import_("@reebeat/core"),
          },
          subtitles: {
            dependencies: ["@reebeat/core"],
            source: import_("@reebeat/core"),
          },
        });

        assert.deepStrictEqual(findings, []);
      }).pipe(Effect.provide(platform))
  );
});

describe("a package that uses a tier it must not is reported with package, tier, dependency and file:line", () => {
  it.effect("negative control: a library importing a service", () =>
    Effect.gen(function* control() {
      const findings = yield* check({
        core: { source: `export {};\n${import_("@reebeat/services")}` },
        services: {},
      });

      assert.deepStrictEqual(Arr.map(findings, describeFinding), [
        "@reebeat/core (libraries): tier libraries must not depend on tier services: @reebeat/services at packages/core/src/index.ts:2",
      ]);
    }).pipe(Effect.provide(platform))
  );

  it.effect("negative control: a service importing an adapter", () =>
    Effect.gen(function* control() {
      const findings = yield* check({
        "cache-fs": {},
        services: { source: import_("@reebeat/cache-fs") },
      });

      assert.deepStrictEqual(Arr.map(findings, describeFinding), [
        "@reebeat/services (services): tier services must not depend on tier adapters: @reebeat/cache-fs at packages/services/src/index.ts:1",
      ]);
    }).pipe(Effect.provide(platform))
  );

  it.effect("negative control: an adapter importing another adapter", () =>
    Effect.gen(function* control() {
      const findings = yield* check({
        "cache-fs": { source: import_("@reebeat/encode-ffmpeg/something") },
        "encode-ffmpeg": {},
      });

      assert.deepStrictEqual(Arr.map(findings, describeFinding), [
        "@reebeat/cache-fs (adapters): tier adapters must not depend on tier adapters: @reebeat/encode-ffmpeg/something at packages/cache-fs/src/index.ts:1",
      ]);
    }).pipe(Effect.provide(platform))
  );

  it.effect("negative control: a program importing an adapter", () =>
    Effect.gen(function* control() {
      const findings = yield* check({
        "encode-ffmpeg": {},
        pipeline: { source: import_("@reebeat/encode-ffmpeg") },
      });

      assert.deepStrictEqual(Arr.map(findings, describeFinding), [
        "@reebeat/pipeline (programs): tier programs must not depend on tier adapters: @reebeat/encode-ffmpeg at packages/pipeline/src/index.ts:1",
      ]);
    }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a manifest dependency alone is enough, with no import",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          core: { dependencies: ["@reebeat/services"] },
          services: {},
        });

        assert.deepStrictEqual(Arr.map(findings, describeFinding), [
          "@reebeat/core (libraries): tier libraries must not depend on tier services: @reebeat/services at packages/core/package.json",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a relative import into another package's sources",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          core: { source: import_("../../services/src/index.ts") },
          services: {},
        });

        assert.deepStrictEqual(Arr.map(findings, describeFinding), [
          "@reebeat/core (libraries): tier libraries must not depend on tier services: ../../services/src/index.ts at packages/core/src/index.ts:1",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a dynamic import of a service, and a computed one, from a library",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          core: {
            source:
              'export const a = import("@reebeat/services");\nexport const b = (name: string) => import(name);\n',
          },
          services: {},
        });

        assert.deepStrictEqual(
          Arr.map(findings, ({ dependency, line }) => `${dependency}:${line}`),
          ["@reebeat/services:1", "<computed>:2"]
        );
      }).pipe(Effect.provide(platform))
  );
});

describe("tools may use anything", () => {
  it.effect(
    "a tool importing an adapter, a program, a service and a library passes",
    () =>
      Effect.gen(function* tool() {
        const findings = yield* check({
          "cache-fs": {},
          cli: {
            dependencies: [
              "@reebeat/cache-fs",
              "@reebeat/pipeline",
              "@reebeat/services",
              "@reebeat/core",
            ],
            source: `${import_("@reebeat/cache-fs")}${import_("@reebeat/pipeline")}${import_("@reebeat/services")}${import_("@reebeat/core")}`,
          },
          core: {},
          pipeline: {},
          services: {},
        });

        assert.deepStrictEqual(findings, []);
      }).pipe(Effect.provide(platform))
  );

  it.effect("negative control: a library importing a tool", () =>
    Effect.gen(function* control() {
      const findings = yield* check({
        cli: {},
        core: { source: import_("@reebeat/cli") },
      });

      assert.deepStrictEqual(Arr.map(findings, describeFinding), [
        "@reebeat/core (libraries): tier libraries must not depend on tier tools: @reebeat/cli at packages/core/src/index.ts:1",
      ]);
    }).pipe(Effect.provide(platform))
  );
});

describe("a package must be in the table", () => {
  it.effect(
    "negative control: a new directory under packages/ without a tier fails",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({ core: {}, mystery: {} });

        assert.deepStrictEqual(Arr.map(findings, describeFinding), [
          "@reebeat/mystery (no tier): has no tier: add it to the table in tools/quality/tiers.ts: packages/mystery at packages/mystery",
        ]);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: depending on a package that is in no tier fails",
    () =>
      Effect.gen(function* control() {
        const findings = yield* check({
          cli: { dependencies: ["@reebeat/mystery"] },
          mystery: {},
        });

        assert.deepStrictEqual(
          Arr.map(
            findings,
            ({ dependency, package: name }) => `${name} -> ${dependency}`
          ),
          [
            "@reebeat/cli -> @reebeat/mystery",
            "@reebeat/mystery -> packages/mystery",
          ]
        );
      }).pipe(Effect.provide(platform))
  );

  it("each package is in exactly one tier", () => {
    const names = Arr.flatMap(Record.values(tiers), (tier) => [...tier]);

    assert.deepStrictEqual(Arr.dedupe(names), names);
    assert.isTrue(Option.isSome(tierOf("services")));
    assert.isTrue(Option.isNone(tierOf("mystery")));
  });

  it("the table has five tiers and none holds a package of the first release's layout", () => {
    assert.deepStrictEqual(Record.keys(tiers), [
      "adapters",
      "libraries",
      "programs",
      "services",
      "tools",
    ]);

    for (const old of ["speech", "deck", "video", "sfx"]) {
      assert.isTrue(Option.isNone(tierOf(old)), old);
    }
  });
});

describe("the repository", () => {
  it.effect(
    "every directory under packages/ is in the table and no package depends against the direction",
    () =>
      Effect.gen(function* repository() {
        const path = yield* Path.Path;

        const findings = yield* checkTiers(
          path.resolve(
            yield* path.fromFileUrl(new URL("../../..", import.meta.url))
          )
        );

        assert.deepStrictEqual(Arr.map(findings, describeFinding), []);
      }).pipe(Effect.provide(platform))
  );
});

describe("sourceFiles: what the gate reads, and what it refuses to skip", () => {
  it.effect(
    "lists TypeScript sources, dotfiles included, and nothing of dependencies, tests, live suites, fixtures, build output or declarations",
    () =>
      Effect.gen(function* listed() {
        const path = yield* Path.Path;

        const root = yield* tree({
          ".git/g.ts": "",
          "bin/run.ts": "",
          "dist/o.ts": "",
          "fixtures/f.ts": "",
          "live/l.ts": "",
          "node_modules/m/x.ts": "",
          "src/.hidden.ts": "",
          "src/a.ts": "",
          "src/c.mts": "",
          "src/d.cts": "",
          "src/e.js": "",
          "src/nested/b.tsx": "",
          "src/nested/node_modules/n.ts": "",
          "src/notes.md": "",
          "src/test/deep.ts": "",
          "src/types.d.ts": "",
          "test/t.ts": "",
        });

        const listing = yield* sourceFiles(root);

        assert.deepStrictEqual(
          Arr.map(listing.files, (file) => path.relative(root, file)),
          [
            "bin/run.ts",
            "src/.hidden.ts",
            "src/a.ts",
            "src/c.mts",
            "src/d.cts",
            "src/nested/b.tsx",
          ]
        );
        assert.deepStrictEqual(listing.opaque, []);
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a symbolic link under the sources is a finding, not followed and not skipped",
    () =>
      Effect.gen(function* linked() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* tree({
          "elsewhere/b.ts": import_("@reebeat/services"),
          "packages/core/package.json": '{"name":"@reebeat/core"}',
          "packages/core/src/index.ts": "export {};\n",
        });

        yield* fs.symlink(
          path.join(root, "elsewhere"),
          path.join(root, "packages", "core", "src", "linked")
        );

        assert.deepStrictEqual(
          Arr.map(yield* checkTiers(root), describeFinding),
          [
            "@reebeat/core (libraries): cannot be checked: a symbolic link or an entry of unknown type, which the tier check does not follow: packages/core/src/linked at packages/core/src/linked",
          ]
        );
      }).pipe(Effect.provide(platform))
  );

  it.effect(
    "negative control: a directory that cannot be read fails the listing with the platform error",
    () =>
      Effect.gen(function* unreadable() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* tree({ "src/a.ts": "", "src/locked/c.ts": "" });
        const locked = path.join(root, "src", "locked");

        const denying = FileSystem.FileSystem.of({
          ...fs,
          readDirectoryEntries: (directory) =>
            directory === locked
              ? Effect.fail(
                  PlatformError.badArgument({
                    description: "the directory cannot be read",
                    method: "readDirectoryEntries",
                    module: "FileSystem",
                  })
                )
              : fs.readDirectoryEntries(directory),
        });

        const error = yield* Effect.flip(
          Effect.provideService(
            sourceFiles(root),
            FileSystem.FileSystem,
            denying
          )
        );

        assert.strictEqual(error.reason._tag, "BadArgument");
      }).pipe(Effect.provide(platform))
  );
});

describe("the edge rule", () => {
  it("allows a package to use itself and libraries to use libraries", () => {
    assert.isTrue(Option.isNone(edgeViolation("services", "services")));
    assert.isTrue(Option.isNone(edgeViolation("core", "subtitles")));
  });

  it("forbids an adapter to use a program, a tool or another adapter", () => {
    assert.isTrue(Option.isSome(edgeViolation("cache-fs", "pipeline")));
    assert.isTrue(Option.isSome(edgeViolation("cache-fs", "cli")));
    assert.isTrue(Option.isSome(edgeViolation("cache-fs", "encode-ffmpeg")));
  });
});

describe("importsOf", () => {
  it("lists imports, type imports, re-exports and dynamic imports with their lines", () => {
    const text = Arr.join(
      [
        'import { a } from "@reebeat/core";',
        'import type { B } from "./b.ts";',
        'export * from "@reebeat/services";',
        'export { c } from "x";',
        'export const d = import("@reebeat/lint");',
        "",
      ],
      "\n"
    );

    assert.deepStrictEqual(
      Arr.map(importsOf(text), ({ line, specifier }) => `${line} ${specifier}`),
      [
        "1 @reebeat/core",
        "2 ./b.ts",
        "3 @reebeat/services",
        "4 x",
        "5 @reebeat/lint",
      ]
    );
  });
});

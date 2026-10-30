// The boundaries of the verify package (spec 0001): it depends on exactly core, encode-ffmpeg, lint, pipeline,
// render-reveal, services, sounds-synth, subtitles and effect; no file under src imports the parser (it re-builds the
// Plan with the core's `buildPlan`), a browser, a Playwright wrapper or a Node built-in; and every import is a relative
// file, one of those packages by name, or `effect`.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Order, Record, Schema } from "effect";
import { parseSync } from "oxc-parser";

import { readPackageText, readSources } from "./support.ts";

const dependencyMap = Schema.Record(Schema.String, Schema.String);

const PackageJson = Schema.Struct({ dependencies: dependencyMap });

type Module = ReturnType<typeof parseSync>["module"];

/** Every static import and re-export specifier of a source text. */
const specifiersOf = (text: string): readonly string[] => {
  const { module }: { module: Module } = parseSync("scan.ts", text);

  return [
    ...Arr.map(
      module.staticImports,
      ({ moduleRequest }) => moduleRequest.value
    ),
    ...Arr.flatMap(module.staticExports, ({ entries }) =>
      Arr.flatMap(entries, ({ moduleRequest }) =>
        moduleRequest ? [moduleRequest.value] : []
      )
    ),
  ];
};

const allowed =
  /^(?:\.{1,2}\/|effect(?:\/|$)|@tsukuri\/(?:core|encode-ffmpeg|lint|pipeline|render-reveal|services|sounds-synth|subtitles)$)/u;

/** The specifiers of a file that it may not import. */
const violations = (name: string, text: string): readonly string[] =>
  Arr.flatMap(specifiersOf(text), (specifier) =>
    allowed.test(specifier) ? [] : [`${name}: ${specifier}`]
  );

describe("F11: packages/verify imports no parser", () => {
  it.effect(
    "depends on exactly core, encode-ffmpeg, lint, pipeline, render-reveal, services, sounds-synth, subtitles and effect",
    () =>
      Effect.gen(function* manifest() {
        const { dependencies } = yield* Effect.flatMap(
          readPackageText("package.json"),
          Schema.decodeEffect(Schema.fromJsonString(PackageJson))
        );

        assert.deepStrictEqual(
          Arr.sort(Record.keys(dependencies), Order.String),
          [
            "@tsukuri/core",
            "@tsukuri/encode-ffmpeg",
            "@tsukuri/lint",
            "@tsukuri/pipeline",
            "@tsukuri/render-reveal",
            "@tsukuri/services",
            "@tsukuri/sounds-synth",
            "@tsukuri/subtitles",
            "effect",
          ]
        );
      })
  );

  it.effect(
    "no file under src imports fountain-js, Playwright, a Node built-in or a package outside the list",
    () =>
      Effect.gen(function* scan() {
        const files = yield* readSources;

        assert.isAtLeast(files.length, 10);
        assert.deepStrictEqual(
          Arr.flatMap(files, ({ name, text }) => violations(name, text)),
          []
        );
      })
  );

  it("control: the scan flags the parser, Playwright, a Node built-in and a source path of another package", () => {
    for (const bad of [
      'import "fountain-js";',
      'import { chromium } from "playwright-core";',
      'import { readFile } from "node:fs";',
      'export { parse } from "fountain-js";',
      'import { parse } from "@tsukuri/core/src/parse.ts";',
    ]) {
      assert.strictEqual(violations("check.ts", bad).length, 1, bad);
    }

    assert.deepStrictEqual(
      violations(
        "check.ts",
        'import { buildPlan } from "@tsukuri/core";\nimport { Effect } from "effect";\nimport { x } from "./x.ts";'
      ),
      []
    );
  });
});

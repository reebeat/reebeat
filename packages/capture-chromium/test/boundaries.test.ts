// Boundaries of packages/capture-chromium (design R3, spec 0001 F11): an adapter depends on the core, the services,
// effect, playwright-core and timeweb and on no other adapter; no file under src imports the parser or another
// package's source path; and only the browser module imports Playwright.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record, Schema } from "effect";
import { parseSync } from "oxc-parser";

import { readPackageText, readSources } from "./sources.ts";

const dependencyMap = Schema.Record(Schema.String, Schema.String);

const PackageJson = Schema.Struct({ dependencies: dependencyMap });

interface Import {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

const staticImportsOf = (
  module: ReturnType<typeof parseSync>["module"]
): readonly Import[] =>
  Arr.map(module.staticImports, ({ entries, moduleRequest }) => ({
    specifier: moduleRequest.value,
    typeOnly: entries.length > 0 && Arr.every(entries, (entry) => entry.isType),
  }));

const reExportsOf = (
  module: ReturnType<typeof parseSync>["module"]
): readonly Import[] =>
  Arr.flatMap(module.staticExports, ({ entries }) =>
    Arr.flatMap(entries, ({ moduleRequest }) =>
      moduleRequest ? [{ specifier: moduleRequest.value, typeOnly: false }] : []
    )
  );

/** Every static import and re-export of a source text; a type-only import is one whose every entry is a type. */
const importsOf = (text: string): readonly Import[] => {
  const { module } = parseSync("scan.ts", text);

  return [...staticImportsOf(module), ...reExportsOf(module)];
};

const relative = /^\.{1,2}\//u;
const allowed = /^(?:effect(?:\/|$)|@reebeat\/(?:core|services)$)/u;

/** What a file may not import: the parser's package, a package's source path, another adapter, Playwright elsewhere. */
const violations = (name: string, text: string): readonly string[] =>
  Arr.flatMap(importsOf(text), ({ specifier }) => {
    if (relative.test(specifier) || allowed.test(specifier)) {
      return [];
    }

    return specifier === "playwright-core" && name === "browser.ts"
      ? []
      : [`${name}: ${specifier}`];
  });

describe("boundaries: packages/capture-chromium", () => {
  it.effect(
    "depends on exactly core, services, effect, playwright-core and timeweb",
    () =>
      Effect.gen(function* manifest() {
        const { dependencies } = yield* Effect.flatMap(
          readPackageText("package.json"),
          Schema.decodeEffect(Schema.fromJsonString(PackageJson))
        );

        const expected = [
          "@reebeat/core",
          "@reebeat/services",
          "effect",
          "playwright-core",
          "timeweb",
        ];

        assert.strictEqual(Record.size(dependencies), expected.length);
        assert.isTrue(
          Arr.every(expected, (name) => Record.has(dependencies, name))
        );
        assert.notProperty(dependencies, "fountain-js");
      })
  );

  it.effect(
    "no file under src imports the parser, another adapter, a source path, or Playwright outside browser.ts",
    () =>
      Effect.gen(function* scan() {
        const files = yield* readSources;

        const found = Arr.flatMap(files, ({ name, text }) =>
          violations(name, text)
        );

        assert.isAtLeast(files.length, 6);
        assert.deepStrictEqual(found, []);
      })
  );

  it("control: the scan flags the parser, another adapter, a source path and Playwright outside the browser module", () => {
    for (const bad of [
      'import "fountain-js";',
      'import { renderDeck } from "@reebeat/render-reveal";',
      'import { muxArgs } from "@reebeat/encode-ffmpeg";',
      'import { chromium } from "playwright-core";',
      'import { parse } from "@reebeat/core/src/parse.ts";',
    ]) {
      assert.strictEqual(violations("capture.ts", bad).length, 1, bad);
    }

    assert.deepStrictEqual(
      violations("browser.ts", 'import { chromium } from "playwright-core";'),
      []
    );
    assert.deepStrictEqual(
      violations(
        "capture.ts",
        'import { requireTimeline } from "@reebeat/core";'
      ),
      []
    );
  });
});

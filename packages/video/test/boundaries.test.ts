// F11, boundaries: packages/video imports no parser. Its manifest depends on exactly @reebeat/core, @reebeat/sfx,
// effect, playwright-core and timeweb; no file under src imports fountain-js or a value of the core (which holds
// the parser), only its types; and only the browser module imports Playwright.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Record, Schema } from "effect";
import { parseSync } from "oxc-parser";

import { readLocal, readSources } from "./support.ts";

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
const allowedEverywhere = /^(?:effect(?:\/|$)|@reebeat\/sfx$)/u;

/** What a file may not import: the parser's package, the core's values or sources, a package's source path. */
const violations = (name: string, text: string): readonly string[] =>
  Arr.flatMap(importsOf(text), ({ specifier, typeOnly }) => {
    if (relative.test(specifier) || allowedEverywhere.test(specifier)) {
      return [];
    }

    if (specifier === "@reebeat/core" && typeOnly) {
      return [];
    }

    return specifier === "playwright-core" && name === "browser.ts"
      ? []
      : [`${name}: ${specifier}`];
  });

describe("F11: packages/video imports no parser", () => {
  it.effect(
    "depends on exactly core, sfx, effect, playwright-core and timeweb",
    () =>
      Effect.gen(function* manifest() {
        const { dependencies } = yield* Effect.flatMap(
          readLocal("../package.json"),
          Schema.decodeEffect(Schema.fromJsonString(PackageJson))
        );

        const expected = [
          "@reebeat/core",
          "@reebeat/sfx",
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
    "no file under src imports the parser, a value of the core, or Playwright outside browser.ts",
    () =>
      Effect.gen(function* scan() {
        const files = yield* readSources;

        const found = Arr.flatMap(files, ({ name, text }) =>
          violations(name, text)
        );

        assert.isAtLeast(files.length, 9);
        assert.deepStrictEqual(found, []);
      })
  );

  it("control: the scan flags the parser, a core value and Playwright outside the browser module", () => {
    for (const bad of [
      'import "fountain-js";',
      'import { buildPlan } from "@reebeat/core";',
      'export { buildPlan } from "@reebeat/core";',
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
        'import type { PlanJson } from "@reebeat/core";'
      ),
      []
    );
  });
});

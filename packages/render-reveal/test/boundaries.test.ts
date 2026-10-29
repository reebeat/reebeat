// F11, single source (spec 0001): packages/render-reveal reads the Plan and never the screenplay. Its manifest depends on
// exactly @reebeat/core (types, and the parser-free `@reebeat/core/steps` that says which effects are steps and where each
// sound plays), @reebeat/services, @reebeat/lint, effect, reveal.js, @fontsource/inter and parse5, and no file under src
// imports a parser, a browser driver or a Node built-in; the core's own entry is a type-only import, so its parser is never loaded; the services and the lint rules are
// libraries and service contracts, never an adapter. The lint rule `no-restricted-imports` (vite.config.ts) is the second
// guard; this scan reads every specifier.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Schema } from "effect";

import { readPackageText, readSources } from "./support.ts";

const Manifest = Schema.fromJsonString(
  Schema.Struct({ dependencies: Schema.Record(Schema.String, Schema.String) })
);

/** `import ... from "x"`, `export ... from "x"`, `import "x"`, `import("x")` and `require(`; the type-only form is marked. */
const statements =
  /\b(?:(?<keyword>import|export)(?<type>\s+type\b)?[^;"']*?\bfrom\s*|import\s*)["'](?<specifier>[^"']+)["']|\bimport\s*\(\s*(?<dynamic>[^)]*)\)|\b(?<required>require\s*\()/gu;

interface Found {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

const importsOf = (text: string): readonly Found[] =>
  Arr.map([...text.matchAll(statements)], ({ groups }) => ({
    specifier:
      groups?.specifier ??
      (groups?.required === undefined
        ? `import(${groups?.dynamic ?? ""})`
        : "require()"),
    typeOnly: groups?.type !== undefined,
  }));

/** What a file under src may import: itself, effect, parse5, the services, the lint rules, `@reebeat/core/steps` and the types of @reebeat/core. */
const violations = (text: string): readonly string[] =>
  Arr.flatMap(importsOf(text), ({ specifier, typeOnly }) => {
    const allowed =
      /^(?:\.{1,2}\/|effect(?:\/|$)|parse5$|@reebeat\/(?:services|lint|core\/steps)$)/u.test(
        specifier
      ) ||
      (specifier === "@reebeat/core" && typeOnly);

    return allowed ? [] : [specifier];
  });

describe("F11: packages/render-reveal reads the Plan, never the screenplay", () => {
  it.effect(
    "depends on exactly the core, the services, the lint rules, effect, reveal.js, Inter and parse5",
    () =>
      Effect.gen(function* manifest() {
        const { dependencies } = yield* Effect.flatMap(
          readPackageText("package.json"),
          Schema.decodeUnknownEffect(Manifest)
        );

        // One deepStrictEqual covers the key set and every value: nothing else is a dependency.
        assert.deepStrictEqual(dependencies, {
          "@fontsource/inter": "catalog:",
          "@reebeat/core": "workspace:*",
          "@reebeat/lint": "workspace:*",
          "@reebeat/services": "workspace:*",
          effect: "catalog:",
          parse5: "catalog:",
          "reveal.js": "catalog:",
        });
      })
  );

  it.effect(
    "no file under src imports a parser, a browser driver or a Node built-in",
    () =>
      Effect.gen(function* scan() {
        const files = yield* readSources;

        assert.isAbove(files.length, 6);

        const offending = Arr.flatMap(files, ({ name, text }) =>
          Arr.map(violations(text), (specifier) => ({ name, specifier }))
        );

        assert.deepStrictEqual(offending, []);
      })
  );

  it("control: the scan flags each forbidden import in a scratch source", () => {
    for (const bad of [
      'import { buildPlan } from "@reebeat/core";',
      'import { type PlanJson } from "@reebeat/core";',
      'export { buildPlan } from "@reebeat/core";',
      'import Fountain from "fountain-js";',
      'import "playwright-core";',
      'import { readFileSync } from "node:fs";',
      'import { join } from "path";',
      'import { encode } from "@reebeat/encode-ffmpeg";',
      'import { capture } from "@reebeat/capture-chromium";',
      'const parser = await import("fountain-js");',
      'const fs = require("fs");',
      'import {\n  buildPlan,\n  collectErrors,\n} from "@reebeat/core";',
    ]) {
      assert.strictEqual(violations(bad).length, 1, bad);
    }
  });

  it("control: the scan accepts the imports src uses", () => {
    for (const good of [
      'import { Effect } from "effect";',
      'import { parse } from "parse5";',
      'import { x } from "./x.ts";',
      'import type { PlanJson } from "@reebeat/core";',
      'import type {\n  Element,\n  Scene,\n} from "@reebeat/core";',
      'import * as Arr from "effect/Array";',
      'import { cueFragmentAgreement } from "@reebeat/lint";',
      'import { Renderer } from "@reebeat/services";',
    ]) {
      assert.deepStrictEqual(violations(good), [], good);
    }
  });
});

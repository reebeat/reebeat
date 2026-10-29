// F11, boundaries: packages/core is pure. Its manifest depends on exactly effect and fountain-js (the first
// from the catalog, the second pinned exactly there), and no file under src imports a browser, Playwright,
// ffmpeg, reveal.js, a UI runtime or a Node built-in. The lint rule `no-restricted-imports` (vite.config.ts) is
// the second guard; this scan is the one that reads every specifier.
import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect, Order, Record, Schema } from "effect";
import { parseSync } from "oxc-parser";

import { readLocal, readSources } from "./support.ts";

const Manifest = Schema.Struct({
  dependencies: Schema.Record(Schema.String, Schema.String),
});

const RootManifest = Schema.Struct({
  catalog: Schema.Record(Schema.String, Schema.String),
});

/** Every module a source text imports, re-exports, requires or imports dynamically (a computed one is "<computed>"). */
const specifiersOf = (text: string): readonly string[] => {
  const { module } = parseSync("scan.ts", text);

  const dynamic = Arr.map(module.dynamicImports, ({ moduleRequest }) => {
    const written = text.slice(moduleRequest.start, moduleRequest.end).trim();

    return /^["'][^"']+["']$/u.test(written)
      ? written.slice(1, -1)
      : "<computed>";
  });

  const reexported = Arr.flatMap(module.staticExports, ({ entries }) =>
    Arr.flatMap(entries, ({ moduleRequest }) =>
      moduleRequest ? [moduleRequest.value] : []
    )
  );

  const required = Arr.map(
    [...text.matchAll(/\brequire\s*\(/gu)],
    () => "require()"
  );

  return [
    ...Arr.map(
      module.staticImports,
      ({ moduleRequest }) => moduleRequest.value
    ),
    ...reexported,
    ...dynamic,
    ...required,
  ];
};

const allowed = /^(?:\.{1,2}\/|effect(?:\/|$)|fountain-js$)/u;

/** The specifiers a pure core must not import: browser, Playwright, reveal.js, UI runtimes, ffmpeg, Node. */
const forbidden =
  /^(?:node:|playwright|@playwright\/|puppeteer|reveal\.js|react(?:-dom)?(?:\/|$)|remotion|@remotion\/|fluent-ffmpeg|ffmpeg|@ffmpeg\/|fs|path|child_process|os|crypto|http|https|net|stream|url|util|zlib|worker_threads|readline|buffer|events|assert|process|module|vm|tty|dns|perf_hooks|timers|v8)(?:\/|$)/u;

const violations = (text: string): readonly string[] =>
  Arr.filter(
    specifiersOf(text),
    (specifier) => forbidden.test(specifier) || !allowed.test(specifier)
  );

describe("F11: packages/core is pure", () => {
  it.effect(
    "depends on exactly effect and fountain-js, the second pinned in the root catalog",
    () =>
      Effect.gen(function* manifest() {
        const decodeManifest = Schema.decodeUnknownEffect(
          Schema.fromJsonString(Manifest)
        );

        const decodeRoot = Schema.decodeUnknownEffect(
          Schema.fromJsonString(RootManifest)
        );

        const { dependencies } = yield* Effect.flatMap(
          readLocal("../package.json"),
          decodeManifest
        );

        const { catalog } = yield* Effect.flatMap(
          readLocal("../../../package.json"),
          decodeRoot
        );

        assert.deepStrictEqual(
          Arr.sort(Record.keys(dependencies), Order.String),
          ["effect", "fountain-js"]
        );
        assert.deepStrictEqual(dependencies, {
          effect: "catalog:",
          "fountain-js": "catalog:",
        });
        assert.strictEqual(catalog["fountain-js"], "1.2.4");
      })
  );

  it.effect(
    "no file under src imports anything but effect, fountain-js and its own modules",
    () =>
      Effect.gen(function* scan() {
        const files = yield* readSources;

        assert.isAbove(files.length, 8);
        assert.deepStrictEqual(
          Arr.flatMap(files, ({ name, text }) =>
            Arr.map(violations(text), (found) => `${name}: ${found}`)
          ),
          []
        );
      })
  );

  it.effect(
    "the `@reebeat/core/steps` subpath reaches no parser: steps.ts and what it imports read only effect and the Plan types",
    () =>
      Effect.gen(function* subpath() {
        const files = yield* readSources;

        const byName = new Map(
          Arr.map(files, ({ name, text }) => [name, text])
        );

        const reach = (name: string): readonly string[] =>
          Arr.filter(
            specifiersOf(byName.get(name) ?? ""),
            (specifier) =>
              !/^effect(?:\/|$)|^\.\/(?:lookup|plan|speed)\.ts$/u.test(
                specifier
              )
          );

        // steps.ts, lookup.ts, plan.ts and speed.ts: nothing else (no parse, story, grammar, build).
        assert.deepStrictEqual(
          Arr.flatMap(["steps.ts", "lookup.ts", "plan.ts", "speed.ts"], reach),
          []
        );
        assert.deepStrictEqual(
          Arr.filter(specifiersOf(byName.get("steps.ts") ?? ""), (specifier) =>
            specifier.startsWith(".")
          ),
          ["./lookup.ts", "./plan.ts"]
        );
      })
  );

  it("control: the scan flags each forbidden import in a scratch source", () => {
    for (const bad of [
      'import "playwright";',
      'import { chromium } from "playwright-core";',
      'import Reveal from "reveal.js";',
      'import { readFileSync } from "node:fs";',
      'import { join } from "path";',
      'import React from "react";',
      'import { spawn } from "node:child_process";',
      'export * from "remotion";',
      'const ffmpeg = await import("fluent-ffmpeg");',
      'import { createFFmpeg } from "@ffmpeg/ffmpeg";',
    ]) {
      assert.deepStrictEqual(violations(bad).length, 1, bad);
    }

    assert.deepStrictEqual(
      violations(
        'import { Effect } from "effect";\nimport { x } from "./x.ts";'
      ),
      []
    );
  });
});

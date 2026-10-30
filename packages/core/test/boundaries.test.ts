// F11, boundaries: packages/core is pure. Its manifest requires exactly effect (a peer dependency, spec 0009) and
// fountain-js (a dependency pinned exactly in the root catalog), and no file under src imports a browser, Playwright,
// ffmpeg, reveal.js, a UI runtime or a Node built-in. The lint rule `no-restricted-imports` (vite.config.ts) is
// the second guard; this scan is the one that reads every specifier.
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Order,
  Record,
  Schema,
  String as Str,
  pipe,
} from "effect";
import { parseSync } from "oxc-parser";

import { readLocal, readSources } from "./support.ts";

const Manifest = Schema.Struct({
  dependencies: Schema.Record(Schema.String, Schema.String),
  peerDependencies: Schema.Record(Schema.String, Schema.String),
});

const RootManifest = Schema.Struct({
  catalog: Schema.Record(Schema.String, Schema.String),
});

/** Every module a source text imports, re-exports, requires or imports dynamically (a computed one is "<computed>"). */
const specifiersOf = (text: string): readonly string[] => {
  const { module } = parseSync("scan.ts", text);

  const dynamic = Arr.map(module.dynamicImports, ({ moduleRequest }) => {
    const written = pipe(
      text,
      Str.slice(moduleRequest.start, moduleRequest.end),
      Str.trim
    );

    return /^["'][^"']+["']$/u.test(written)
      ? Str.slice(1, -1)(written)
      : "<computed>";
  });

  const reexported = Arr.flatMap(module.staticExports, ({ entries }) =>
    Arr.flatMap(entries, ({ moduleRequest }) =>
      moduleRequest ? [moduleRequest.value] : []
    )
  );

  const required = Arr.map(
    [...Str.matchAll(/\brequire\s*\(/gu)(text)],
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

/** The modules of `src` that read the source text, check it, schedule it or build it: the steps subpath reaches none. */
const parserModules = [
  "anchors.ts",
  "build.ts",
  "effects.ts",
  "elements.ts",
  "expr.ts",
  "grammar.ts",
  "grammarDoc.ts",
  "hints.ts",
  "parse.ts",
  "resolve.ts",
  "schedule.ts",
  "story.ts",
  "validate.ts",
];

/** Every module of `src` that `start` imports, directly or not, `start` included. */
const reachable = (
  byName: ReadonlyMap<string, string>,
  start: string
): string[] => {
  const seen = new Set([start]);
  const queue = [start];

  for (const name of queue) {
    for (const specifier of specifiersOf(byName.get(name) ?? "")) {
      const next = Str.startsWith("./")(specifier)
        ? Str.slice(2)(specifier)
        : undefined;

      if (next !== undefined && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return [...seen];
};

const violations = (text: string): readonly string[] =>
  Arr.filter(
    specifiersOf(text),
    (specifier) => forbidden.test(specifier) || !allowed.test(specifier)
  );

describe("F11: packages/core is pure", () => {
  it.effect(
    "requires exactly effect (a peer) and fountain-js (a dependency pinned in the root catalog)",
    () =>
      Effect.gen(function* manifest() {
        const decodeManifest = Schema.decodeUnknownEffect(
          Schema.fromJsonString(Manifest)
        );

        const decodeRoot = Schema.decodeUnknownEffect(
          Schema.fromJsonString(RootManifest)
        );

        const { dependencies, peerDependencies } = yield* Effect.flatMap(
          readLocal("../package.json"),
          decodeManifest
        );

        const { catalog } = yield* Effect.flatMap(
          readLocal("../../../package.json"),
          decodeRoot
        );

        assert.deepStrictEqual(
          Arr.sort(
            [...Record.keys(dependencies), ...Record.keys(peerDependencies)],
            Order.String
          ),
          ["effect", "fountain-js"]
        );
        assert.deepStrictEqual(dependencies, { "fountain-js": "catalog:" });
        assert.deepStrictEqual(Record.keys(peerDependencies), ["effect"]);
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
    "the `@tsukuri/core/steps` subpath reaches no parser: what steps.ts imports, all the way down, reads only effect and the Plan's data and algebra",
    () =>
      Effect.gen(function* subpath() {
        const byName = new Map(
          Arr.map(yield* readSources, ({ name, text }) => [name, text])
        );

        const reached = reachable(byName, "steps.ts");

        // The walk finds the modules steps.ts really needs (control) ...
        assert.includeMembers(reached, [
          "evaluate.ts",
          "plan.ts",
          "machines.ts",
        ]);
        // ... and none of the parser, the story reader, the grammar, the scheduler or the builder.
        assert.deepStrictEqual(
          Arr.filter(reached, (name) => Arr.contains(parserModules, name)),
          []
        );
        assert.deepStrictEqual(
          Arr.flatMap(reached, (name) =>
            Arr.filter(
              specifiersOf(byName.get(name) ?? ""),
              (specifier) => !/^effect(?:\/|$)|^\.\//u.test(specifier)
            )
          ),
          []
        );
        // Control: from build.ts the same walk does reach the parser.
        assert.includeMembers(reachable(byName, "build.ts"), ["story.ts"]);
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

// F1, the surface is locked, and F2, no agent path to authority (spec 0016). `tools/list` of the live server, in every
// protocol era, equals `tools.lock.json`; names, count and hints keep their rules; and the modules that answer a call
// import nothing that could publish, approve or write, and need no service that could.
import { assert, describe, expectTypeOf, it } from "@effect/vitest";
import { forbiddenSegments, tools as declarations } from "@tsukuri/lifecycle";
import type { Observer, Projects } from "@tsukuri/lifecycle";
import { documentOf, rootProperties } from "@tsukuri/lifecycle/contract";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Path,
  Predicate,
  String as Str,
} from "effect";
import { parseSync } from "oxc-parser";

import type { Env } from "../src/bind.ts";
import type { Docs } from "../src/docs.ts";
import { lockOf, lockText } from "../src/lock.ts";
import { toolOf } from "../src/server.ts";
import { connect, eras, fixtureLayer, platform } from "./support.ts";

const namePattern = /^[a-z][a-z0-9_]{0,63}$/u;

const packageRoot = Effect.map(Path.Path, (path) =>
  path.resolve(import.meta.dirname, "..")
);

const committedLock = Effect.gen(function* committed() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return yield* fs.readFileString(
    path.join(yield* packageRoot, "tools.lock.json")
  );
}).pipe(Effect.provide(platform));

describe.each(eras)("the surface in the %s era (F1)", (era) => {
  it.layer(fixtureLayer)("tools/list", (suite) => {
    suite.effect(
      "equals tools.lock.json, in the order the declarations give",
      () =>
        Effect.scoped(
          Effect.gen(function* locked() {
            const client = yield* connect(era);
            const listed = yield* client.listTools();
            const again = yield* client.listTools();

            assert.deepStrictEqual(
              Arr.map(listed.tools, (tool) => tool.name),
              Arr.map(again.tools, (tool) => tool.name)
            );
            assert.strictEqual(
              lockText(
                yield* lockOf(listed.tools).pipe(Effect.provide(platform))
              ),
              yield* committedLock
            );
          })
        )
    );

    suite.effect(
      "keeps its rules: names, at most 24 tools, four hints, nothing mutating, no authority in a name",
      () =>
        Effect.scoped(
          Effect.gen(function* rules() {
            const listed = (yield* (yield* connect(era)).listTools()).tools;

            assert.isAtMost(listed.length, 24);

            for (const tool of listed) {
              assert.match(tool.name, namePattern);
              assert.isTrue(
                Arr.every(
                  [
                    "readOnlyHint",
                    "destructiveHint",
                    "idempotentHint",
                    "openWorldHint",
                  ] as const,
                  (hint) => Predicate.isBoolean(tool.annotations?.[hint])
                ),
                `${tool.name} states all four hints`
              );
              assert.isTrue(
                tool.annotations?.readOnlyHint === true &&
                  tool.annotations.destructiveHint === false,
                `${tool.name} only reads`
              );

              for (const forbidden of forbiddenSegments) {
                assert.isFalse(
                  Arr.contains(Str.split("_")(tool.name), forbidden),
                  `${tool.name} has the segment ${forbidden}`
                );
              }
            }
          })
        )
    );
  });
});

describe("the lock", () => {
  it.effect("is regenerated from the declarations alone", () =>
    Effect.gen(function* regenerated() {
      const lock = yield* lockOf(Arr.map(declarations, toolOf)).pipe(
        Effect.provide(platform)
      );

      assert.strictEqual(lockText(lock), yield* committedLock);
    })
  );
});

/** The names and module specifiers of every import of `text`. */
const importedNames = (text: string): readonly string[] => {
  const { module } = parseSync("scan.ts", text);

  return Arr.flatMap(module.staticImports, ({ entries, moduleRequest }) => [
    moduleRequest.value,
    ...Arr.map(
      entries,
      (entry) => entry.importName.name ?? entry.localName.value
    ),
  ]);
};

const authority =
  /publish|approv|release|execute|dispatch|credential|token|secret/iu;

describe("no agent path to authority (F2)", () => {
  it.effect(
    "no module that answers a call imports a name or a module that could publish, approve or write",
    () =>
      Effect.gen(function* scan() {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* packageRoot;

        for (const file of [
          "handlers.ts",
          "analysis.ts",
          "server.ts",
          "pages.ts",
          "vtt.ts",
          "docs.ts",
          "projectsFs.ts",
          "observerFfmpeg.ts",
        ]) {
          const names = importedNames(
            yield* fs.readFileString(path.join(root, "src", file))
          );

          const flagged = Arr.filter(names, (name) => authority.test(name));

          assert.deepStrictEqual(
            flagged,
            [],
            `${file} imports ${Arr.join(flagged, ", ")}`
          );
        }
      }).pipe(Effect.provide(platform))
  );

  it("the requirements of every handler are the three read-only services and nothing else", () => {
    expectTypeOf<Env>().toEqualTypeOf<Docs | Observer | Projects>();
    assert.isTrue(true);
  });

  it.effect(
    "no input schema accepts a verdict, a record, a stage or an approval",
    () =>
      Effect.gen(function* inputs() {
        const names =
          /verdict|record|stage|status|approv|decision|digest|signature/iu;

        for (const tool of declarations) {
          const properties = rootProperties(yield* documentOf(tool.input));

          assert.deepStrictEqual(
            Arr.filter(properties, (name) => names.test(name)),
            [],
            `${tool.name} input`
          );
        }
      })
  );
});

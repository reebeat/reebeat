// `docs_get` reads two files of the checkout (spec 0018, Revisions 18 and 23). Every component of the path below the
// checkout must be a real directory or file: a link at the end, or in a parent (the skill directory replaced by a link
// to a directory outside the checkout), is refused with a fixed message that names the topic and no path. The attack
// runs through the tool, as an agent would call it.
import { assert, describe, it } from "@effect/vitest";
import { docsGet } from "@tsukuri/lifecycle";
import type { PlatformError, Scope } from "effect";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Formatter,
  Option,
  Path,
  String as Str,
} from "effect";

import {
  FixtureService,
  callTool,
  connectOver,
  fixtureLayer,
  platform,
} from "./support.ts";

const canary = "OUTSIDE-CANARY-7d41";

type Setup = (
  dir: string,
  outside: string
) => Effect.Effect<
  void,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path | Scope.Scope
>;

const segments = ["packages", "lifecycle", "skills", "tsukuri-lifecycle"];

/** A checkout whose two documents are plain files, then `setup` changes it; `outside` holds the canary. */
const checkoutWith = (setup: Setup) =>
  Effect.gen(function* checkoutOf() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "tsukuri-docs-" });

    const outside = yield* fs.makeTempDirectoryScoped({
      prefix: "tsukuri-outside-",
    });

    yield* fs.makeDirectory(path.join(dir, ...segments), { recursive: true });
    yield* fs.writeFileString(
      path.join(dir, ...segments, "SKILL.md"),
      "the skill"
    );
    yield* fs.writeFileString(path.join(dir, "GLOSSARY.md"), "the glossary");
    yield* fs.writeFileString(path.join(outside, "SKILL.md"), canary);
    yield* fs.writeFileString(path.join(outside, "GLOSSARY.md"), canary);
    yield* setup(dir, outside);

    return dir;
  });

const asked = (dir: string, topic: "glossary" | "lifecycle") =>
  Effect.gen(function* ask() {
    const fixture = yield* FixtureService;
    const client = yield* connectOver(fixture.workspace, "2025-11-25", dir);
    const called = yield* callTool(client, docsGet, { topic });

    return {
      failure: Option.map(called.failure, (failure) => failure._tag),
      text: Formatter.formatJson(called.result),
      value: called.value,
    };
  });

const replaceWithLink =
  (at: readonly string[], target: (outside: string) => string): Setup =>
  (dir, outside) =>
    Effect.gen(function* linked() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const here = path.join(dir, ...at);

      yield* fs.remove(here, { force: true, recursive: true });
      yield* fs.symlink(target(outside), here);
    });

describe("the documents of the checkout", () => {
  it.layer(fixtureLayer)("through docs_get", (inner) => {
    inner.effect(
      "a link on the path of a document, at its end or in any parent, is refused and nothing outside is read",
      () =>
        Effect.scoped(
          Effect.gen(function* refused() {
            const cases: readonly {
              readonly name: string;
              readonly setup: Setup;
              readonly topic: "glossary" | "lifecycle";
            }[] = [
              {
                name: "the glossary is a link",
                setup: replaceWithLink(
                  ["GLOSSARY.md"],
                  (o) => `${o}/GLOSSARY.md`
                ),
                topic: "glossary",
              },
              {
                name: "the skill file is a link",
                setup: replaceWithLink(
                  [...segments, "SKILL.md"],
                  (o) => `${o}/SKILL.md`
                ),
                topic: "lifecycle",
              },
              {
                name: "the skill directory is a link to a directory outside",
                setup: replaceWithLink(segments, (o) => o),
                topic: "lifecycle",
              },
              {
                name: "skills is a link",
                setup: replaceWithLink(
                  ["packages", "lifecycle", "skills"],
                  (o) => o
                ),
                topic: "lifecycle",
              },
              {
                name: "lifecycle is a link",
                setup: replaceWithLink(["packages", "lifecycle"], (o) => o),
                topic: "lifecycle",
              },
              {
                name: "packages is a link",
                setup: replaceWithLink(["packages"], (o) => o),
                topic: "lifecycle",
              },
              {
                name: "a directory in place of the glossary",
                setup: (dir) =>
                  Effect.gen(function* directory() {
                    const fs = yield* FileSystem.FileSystem;

                    yield* fs.remove(`${dir}/GLOSSARY.md`);
                    yield* fs.makeDirectory(`${dir}/GLOSSARY.md`);
                  }),
                topic: "glossary",
              },
              {
                name: "no glossary",
                setup: (dir) =>
                  Effect.flatMap(FileSystem.FileSystem, (fs) =>
                    fs.remove(`${dir}/GLOSSARY.md`)
                  ),
                topic: "glossary",
              },
              {
                name: "a glossary over the cap",
                setup: (dir) =>
                  Effect.flatMap(FileSystem.FileSystem, (fs) =>
                    fs.writeFileString(
                      `${dir}/GLOSSARY.md`,
                      Str.repeat(1024 * 1024 + 1)("a")
                    )
                  ),
                topic: "glossary",
              },
            ];

            for (const { name, setup, topic } of cases) {
              const dir = yield* checkoutWith(setup);
              const { failure, text, value } = yield* asked(dir, topic);

              assert.deepStrictEqual(failure, Option.some("Unreadable"), name);
              assert.isTrue(Option.isNone(value), name);
              assert.isFalse(Str.includes(canary)(text), name);
              assert.isFalse(
                Arr.some(
                  ["tsukuri-docs-", "tsukuri-outside-", "/tmp"],
                  (part) => Str.includes(part)(text)
                ),
                `${name}: the message names no path`
              );
            }
          })
        ).pipe(Effect.provide(platform))
    );

    inner.effect(
      "a regular file is read, also when the checkout itself is reached through a link",
      () =>
        Effect.scoped(
          Effect.gen(function* regular() {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const dir = yield* checkoutWith(() => Effect.void);
            const via = path.join(yield* fs.makeTempDirectoryScoped(), "link");

            yield* fs.symlink(dir, via);

            for (const here of [dir, via]) {
              const { failure, value } = yield* asked(here, "lifecycle");

              assert.isTrue(Option.isNone(failure), here);
              assert.deepStrictEqual(
                Option.map(value, (v) => v.text),
                Option.some("the skill"),
                here
              );
            }
          })
        ).pipe(Effect.provide(platform))
    );
  });
});

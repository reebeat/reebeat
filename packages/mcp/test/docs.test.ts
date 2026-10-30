// `docs_get` reads two files of the checkout (spec 0018, Revision 14): each must be a regular file, not a link, under the
// size cap, and a failure names the topic, never a path.
import { assert, describe, it } from "@effect/vitest";
import type { Scope } from "effect";
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Path,
  String as Str,
} from "effect";

import { Docs, fileDocs } from "../src/docs.ts";
import { platform } from "./support.ts";

const checkoutWith = (
  glossary: (
    file: string
  ) => Effect.Effect<void, unknown, FileSystem.FileSystem | Scope.Scope>
) =>
  Effect.gen(function* checkoutOf() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "tsukuri-docs-" });

    const skill = path.join(
      dir,
      "packages",
      "lifecycle",
      "skills",
      "tsukuri-lifecycle"
    );

    yield* fs.makeDirectory(skill, { recursive: true });
    yield* fs.writeFileString(path.join(skill, "SKILL.md"), "the skill");
    yield* Effect.orDie(glossary(path.join(dir, "GLOSSARY.md")));

    return dir;
  });

const read = (dir: string, topic: "glossary" | "lifecycle") =>
  Effect.flip(
    Effect.provide(
      Effect.flatMap(Docs, (docs) => docs.read(topic)),
      Layer.provide(fileDocs(dir), platform)
    )
  );

describe("the documents of the checkout", () => {
  it.effect(
    "a link, a directory, a missing file and an oversized file are refused with a fixed message",
    () =>
      Effect.scoped(
        Effect.gen(function* refused() {
          const fs = yield* FileSystem.FileSystem;

          const cases = [
            (dir: string) =>
              Effect.gen(function* linked() {
                const target = yield* fs.makeTempDirectoryScoped({
                  prefix: "tsukuri-outside-",
                });

                yield* fs.writeFileString(`${target}/secret`, "OUTSIDE-CANARY");
                yield* fs.symlink(`${target}/secret`, dir);
              }),
            (dir: string) => fs.makeDirectory(dir),
            () => Effect.void,
            (dir: string) =>
              fs.writeFileString(dir, Str.repeat(1024 * 1024 + 1)("a")),
          ];

          for (const glossary of cases) {
            const failure = yield* read(
              yield* checkoutWith(glossary),
              "glossary"
            );

            assert.strictEqual(failure._tag, "Unreadable");
            assert.isFalse(Str.includes("OUTSIDE-CANARY")(failure.message));
            assert.isFalse(
              Arr.some(["/tmp", "tsukuri-docs-"], (part) =>
                Str.includes(part)(failure.message)
              )
            );
          }
        })
      ).pipe(Effect.provide(platform))
  );

  it.effect("a regular file under the cap is read", () =>
    Effect.scoped(
      Effect.gen(function* regular() {
        const fs = yield* FileSystem.FileSystem;

        const dir = yield* checkoutWith((file) =>
          fs.writeFileString(file, "the glossary")
        );

        const text = yield* Effect.provide(
          Effect.flatMap(Docs, (docs) => docs.read("lifecycle")),
          Layer.provide(fileDocs(dir), platform)
        );

        assert.strictEqual(text, "the skill");
      })
    ).pipe(Effect.provide(platform))
  );
});

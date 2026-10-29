// `reebeat lint` (spec 0002, M2, F2 to F5): every problem of a story with its file, line and message; the exit is not
// zero for an error and zero for a story that only lists absolute times that have their reason (F5).
import { assert, layer } from "@effect/vitest";
import { Array as Arr, Effect, FileSystem, Layer, Path, Result } from "effect";
import { TestConsole } from "effect/testing";

import { lintStory } from "../src/lint.ts";
import { platform } from "./platform.ts";

const story = (effects: readonly string[], dialogue = "One two three.") =>
  Arr.join(
    [
      "Title: Lint",
      "",
      "# Part",
      "",
      "INT. ONE #one#",
      "",
      "Box {id=a cell=mc class=box}",
      "",
      "[[effects",
      ...effects,
      "]]",
      "",
      "NARRATOR",
      dialogue,
      "",
    ],
    "\n"
  );

/** Lints `text` in a temporary file: the file, the exit and what was printed. */
const lint = (text: string) =>
  Effect.gen(function* run() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "reebeat-lint-" });
    const file = path.join(dir, "story.fountain");

    yield* fs.writeFileString(file, text);

    const exit = yield* Effect.result(lintStory(file));

    return {
      exit,
      file,
      stdout: Arr.join(Arr.map(yield* TestConsole.logLines, String), "\n"),
    };
  }).pipe(Effect.provide(Layer.fresh(TestConsole.layer)));

layer(platform)("reebeat lint", (it) => {
  it.effect(
    "prints nothing but the verdict for a story without a problem and succeeds",
    () =>
      Effect.gen(function* clean() {
        const { exit, file, stdout } = yield* lint(
          story(['  s1: sound pop at word("two").end'])
        );

        assert.isTrue(Result.isSuccess(exit));
        assert.include(stdout, `${file}: 0 errors, 0 absolute times listed`);
      })
  );

  it.effect(
    "lists each error with its file, line, tag and message, and fails with the count",
    () =>
      Effect.gen(function* broken() {
        const { exit, file, stdout } = yield* lint(
          story([
            '  s1: sound pop at word("two").end',
            "  s2: sound pops at scene.start",
            "  s3: sound pop at scene.start +100",
          ])
        );

        assert.isTrue(Result.isFailure(exit));
        assert.include(
          stdout,
          `${file}:11: error UnknownSfx: unknown sound "pops"; expected pop, whoosh or ding; did you mean pop?`
        );
        assert.include(
          stdout,
          `${file}:12: error BadEffect: offset "+100" has no unit; expected ms, s, f or %; did you mean s?`
        );
        assert.deepStrictEqual(
          Result.isFailure(exit)
            ? [exit.failure._tag, exit.failure.message]
            : [],
          ["LintFailed", `${file}: 2 errors, 0 absolute times listed`]
        );
      })
  );

  it.effect(
    "lists a reference that does not resolve, with the nearest word",
    () =>
      Effect.gen(function* reference() {
        const { exit, file, stdout } = yield* lint(
          story(['  s1: sound pop at word("tow").end'])
        );

        assert.isTrue(Result.isFailure(exit));
        assert.include(
          stdout,
          `${file}:10: error UnknownReference: word("tow").end: the narration of Scene one has no "tow"; expected words that the Lines of this Scene say; did you mean word("two")?`
        );
      })
  );

  it.effect(
    "F5: an absolute time without a reason is an error; with one it is listed and the exit is zero",
    () =>
      Effect.gen(function* absolute() {
        const without = yield* lint(story(["  s1: sound pop at 1s"]));

        const given = yield* lint(
          story(['  s1: sound pop at 1s because "the music"'])
        );

        assert.isTrue(Result.isFailure(without.exit));
        assert.include(
          without.stdout,
          'error AbsoluteNeedsReason: absolute time "1s" has no reason'
        );
        assert.isTrue(Result.isSuccess(given.exit));
        assert.include(
          given.stdout,
          `${given.file}:10: info absolute-time: scene one, effect s1: absolute time 1s because "the music"`
        );
        assert.include(given.stdout, "0 errors, 1 absolute time listed");
      })
  );

  it.effect(
    "F4: a release-1 story is rejected line by line with the replacement",
    () =>
      Effect.gen(function* old() {
        const { exit, stdout } = yield* lint(
          Arr.join(
            [
              "Title: Old",
              "",
              "# Part",
              "",
              "INT. ONE",
              "",
              "Box {#a @mc .box}",
              "",
              "NARRATOR",
              "One two. [[next]] Three.",
              "",
            ],
            "\n"
          )
        );

        assert.isTrue(Result.isFailure(exit));
        assert.include(stdout, ":5: error BadSceneId");
        assert.include(
          stdout,
          ":7: error ReleaseOneForm: release-1 Element form {#a @mc .box}"
        );
        assert.include(
          stdout,
          ":10: error ReleaseOneForm: release-1 cue [[next]] in dialogue"
        );
      })
  );
});

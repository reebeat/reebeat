// `tsukuri lint` (spec 0002, M2, F2 to F5): every problem of a story with its file, line and message; the exit is not
// zero for an error and zero for a story that only lists absolute times that have their reason (F5).
import { assert, layer } from "@effect/vitest";
import {
  Array as Arr,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Result,
} from "effect";
import { TestConsole } from "effect/testing";

import { lintStory } from "../src/lint.ts";
import { platform } from "./platform.ts";
import { fillCache, runCli, storyFile } from "./support.ts";

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
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "tsukuri-lint-" });
    const file = path.join(dir, "story.fountain");

    yield* fs.writeFileString(file, text);

    const exit = yield* Effect.result(lintStory(file));

    return {
      exit,
      file,
      stdout: Arr.join(Arr.map(yield* TestConsole.logLines, String), "\n"),
    };
  }).pipe(Effect.provide(Layer.fresh(TestConsole.layer)));

layer(platform)("tsukuri lint", (it) => {
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
    "lists an anchor that names no edge of a declared machine, with the file and the line",
    () =>
      Effect.gen(function* glide() {
        const { exit, file, stdout } = yield* lint(
          story(["  s1: sound pop at a.glide.start"])
        );

        assert.isTrue(Result.isFailure(exit));
        assert.include(stdout, `${file}:10: error `);
        assert.include(stdout, "a.glide.start");
      })
  );

  it.effect(
    "lists a derived event nothing uses and an until that is its own fire as errors at their lines",
    () =>
      Effect.gen(function* rules() {
        const { exit, file, stdout } = yield* lint(
          story([
            '  let spare = word("one").end',
            '  f1: focus a at word("two").end until word("two").end',
          ])
        );

        assert.isTrue(Result.isFailure(exit));
        assert.include(
          stdout,
          `${file}:10: error derived-event-never-used: scene one: the derived event spare (word("one").end) is never used`
        );
        assert.include(
          stdout,
          `${file}:11: error until-is-its-own-fire: scene one, effect f1: until word("two").end is the event it fires at, and until takes`
        );
        assert.deepStrictEqual(
          Result.isFailure(exit) ? exit.failure.message : "",
          `${file}: 2 errors, 0 absolute times listed`
        );
      })
  );

  it.effect(
    "does not list a derived event an effect uses, even only in its until",
    () =>
      Effect.gen(function* used() {
        const { exit, stdout } = yield* lint(
          story([
            '  let done = word("three").end',
            '  f1: focus a at word("one").end until done',
          ])
        );

        assert.isTrue(Result.isSuccess(exit));
        assert.notInclude(stdout, "derived-event-never-used");
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

/** Two Scenes, each with an `[[effects]]` block: the second Scene has two Lines. */
const timedStory = (first: readonly string[], second: readonly string[]) =>
  Arr.join(
    [
      "Title: Timing",
      "",
      "# Part",
      "",
      "INT. ONE #one#",
      "",
      "Box {id=a cell=mc class=box}",
      "",
      "[[effects",
      ...first,
      "]]",
      "",
      "NARRATOR",
      "One box here.",
      "",
      "INT. TWO #two#",
      "",
      "Box {id=a cell=tl class=box}",
      "Note {id=note cell=br class=label visible=false}",
      "",
      "[[effects",
      ...second,
      "]]",
      "",
      "NARRATOR",
      "The second Line.",
      "",
      "NARRATOR",
      "And the third Line.",
      "",
    ],
    "\n"
  );

/** The flags that select the narrator the cache was filled with (the offline stand-ins). */
const offline = ["--speech", "silent", "--aligner", "even"] as const;

/** Lints `text` with a speech cache beside it, filled by the stand-ins when `cached`. */
const lintWithCache = (text: string, cached: boolean) =>
  Effect.gen(function* lintCached() {
    const path = yield* Path.Path;
    const file = yield* storyFile(text);
    const cacheDir = path.join(path.dirname(file), "speech-cache");

    if (cached) {
      yield* fillCache(cacheDir, text);
    }

    return { file, ...(yield* runCli(["lint", file, ...offline])) };
  });

const okSecond = ['  r1: show note at word("third").start'];

layer(platform)("tsukuri lint with the speech cache of the story", (it) => {
  it.effect(
    "finds an effect that falls outside its Scene, with its line: a sound 30 s after the word",
    () =>
      Effect.gen(function* late() {
        const { exit, file, stdout } = yield* lintWithCache(
          timedStory(['  s1: sound ding at word("box").end +30s'], okSecond),
          true
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.include(
          stdout,
          `${file}:10: error EffectOutsideScene: effect s1 (line 10) resolves to frame`
        );
        assert.include(stdout, "Timing: checked against the speech cache");
        assert.notInclude(stdout, "Timing: not checked");
      })
  );

  it.effect(
    "finds a show whose command would come before its slide change: two seconds before a word",
    () =>
      Effect.gen(function* early() {
        const { exit, file, stdout } = yield* lintWithCache(
          timedStory(
            ['  s1: sound ding at word("box").end'],
            ['  r1: show note at word("second").start -2s']
          ),
          true
        );

        assert.isTrue(Exit.isFailure(exit));
        assert.include(
          stdout,
          `${file}:22: error EffectOutsideScene: effect r1 (line 22) resolves to frame`
        );
      })
  );

  it.effect(
    "a story that schedules passes, and says it checked the timing",
    () =>
      Effect.gen(function* fine() {
        const { exit, stdout } = yield* lintWithCache(
          timedStory(['  s1: sound ding at word("box").end'], okSecond),
          true
        );

        assert.isTrue(Exit.isSuccess(exit));
        assert.include(stdout, "0 errors, 0 absolute times listed");
        assert.include(stdout, "Timing: checked against the speech cache");
      })
  );

  it.effect(
    "without the cache it checks no timing and says that `plan --timing` or `build` finds it, not lint",
    () =>
      Effect.gen(function* missing() {
        const { exit, stdout } = yield* lintWithCache(
          timedStory(['  s1: sound ding at word("box").end +30s'], okSecond),
          false
        );

        assert.isTrue(Exit.isSuccess(exit));
        assert.include(stdout, "Timing: not checked.");
        assert.include(
          stdout,
          "`tsukuri plan --timing` or `tsukuri build` finds it, not `tsukuri lint`"
        );
      })
  );
});
